#version 330
uniform vec2 u_resolution;
uniform int u_bvhDataOffset;

uniform sampler2D accumTexture;

uniform sampler2D u_modelData;
uniform int u_numTriangles;

uniform vec3 u_cameraPos;
uniform vec3 u_camFront;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform int u_frame;
uniform int u_mode;
uniform int u_seed;

uniform sampler2D u_texture;

uint seed;
out vec4 FragColor;

//==========DATA OPERATING AND MATH FUNCTIONS==========//

const float PI = 3.14159265359;

uint pcg_hash(uint x) {
  x = x * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return x;
}

float random() {
  seed = pcg_hash(seed);
  return uintBitsToFloat((seed >> 9u) | 0x3F800000u) - 1.0;
}

vec3 fetchModelData(int index) {
  int x = index & 1023;
  int y = index >> 10;
  return texelFetch(u_modelData, ivec2(x, y), 0).rgb;
}

vec3 random_on_unit_sphere() {
  float a = random() * 2.0 * PI;
  float z = random() * 2.0 - 1;
  float r = sqrt(1.0 - z * z);
  return vec3(r * cos(a), r * sin(a), z);
}

//==========STRUCTURES==========//

struct ray {
  vec3 origin;
  vec3 direction;
};

struct material {
  int ID; // 0 - Lambertian, 1 - Metal, 2 - Glass
  int textureID;
  vec3 albedo;
  vec4 emission; //r, g, b and emission power
  float refractive_index;
  float reflection_chance;
};

struct hit_record {
  float t; //distance from ray origin
  vec3 p; //point of intersection in 3d space
  vec3 normal;
  material material;
};

struct sphere {
  vec3 center;
  float radius;
  material mat;
};

struct plane {
  vec3 origin;
  vec3 normal;
  material mat;
};

const sphere spheres[5] = sphere[](
    sphere(vec3(0.5, 2.0, 0.0), 0.5, material(0, 0, vec3(1), vec4(1, 1, 1, 2), 1, 0)),
    sphere(vec3(1.5, 0.0, -2.0), 0.5, material(0, 0, vec3(0.8, 0.3, 0.3), vec4(0.8, 0.3, 0.3, 0), 1, 0)),
    sphere(vec3(-0.5, 0.0, -1.0), 0.5, material(2, 0, vec3(1), vec4(0), 1.5, 0)),
    sphere(vec3(1, 0.0, -1.0), 0.5, material(0, 1, vec3(0.3, 0.7, 0.3), vec4(0), 1, 0)),
    sphere(vec3(-1.5, 0.0, -2.0), 0.5, material(0, 0, vec3(0.3, 0.3, 0.7), vec4(0.0), 1, 0))
  );

const plane cornellBox[6] = plane[](
    plane(vec3(0, 2, 0), vec3(0, -1, 0), material(0, 0, vec3(1), vec4(0), 1, 0)),
    plane(vec3(0, -0.5, 0), vec3(0, 1, 0), material(0, 0, vec3(1), vec4(0), 1, 0)),
    plane(vec3(-2.5, 0, 0), vec3(1, 0, 0), material(0, 0, vec3(0.1, 0.8, 0.1), vec4(0), 1, 0)),
    plane(vec3(2.5, 2, 0), vec3(-1, 0, 0), material(0, 0, vec3(0.8, 0.1, 0.1), vec4(0), 1, 0)),
    plane(vec3(0, 0, -3), vec3(0, 0, 1), material(0, 0, vec3(0.1, 0.1, 0.8), vec4(0), 1, 0)),
    plane(vec3(0, 0, 1), vec3(0, 0, -1), material(0, 0, vec3(0.1, 0.1, 0.8), vec4(0), 1, 0))
  );

//==========RAY HIT FUNCTIONS==========//

//vector2 ray_t is an interval in which collision will be detected. x is minimum distance from ray origin and y is maximum

float hit_aabb_dist(ray r, vec3 invD, vec3 aabb_min, vec3 aabb_max, vec2 ray_t) {
  vec3 t0 = (aabb_min - r.origin) * invD;
  vec3 t1 = (aabb_max - r.origin) * invD;

  vec3 tSmaller = min(t0, t1);
  vec3 tBigger = max(t0, t1);

  float tMin = max(ray_t.x, max(tSmaller.x, max(tSmaller.y, tSmaller.z)));
  float tMax = min(ray_t.y, min(tBigger.x, min(tBigger.y, tBigger.z)));

  if (tMin < tMax) return tMin;
  return -1.0;
}

bool hit_3d_model(ray r, vec2 ray_t, out hit_record rec) {
  bool hit_anything = false;
  float closest = ray_t.y;
  int closest_base_index = -1;

  int stack[12];
  int stackPtr = 0;

  stack[stackPtr++] = 0;

  vec3 invRayDir = 1.0 / r.direction;

  while (stackPtr > 0) {
    int nodeIdx = stack[--stackPtr];

    int nodeDataIndex = u_bvhDataOffset + nodeIdx * 3; //fetching data of specific triangle
    vec3 aabbMin = fetchModelData(nodeDataIndex + 0);
    vec3 aabbMax = fetchModelData(nodeDataIndex + 1);
    vec3 data = fetchModelData(nodeDataIndex + 2);

    float aabb_dist = hit_aabb_dist(r, invRayDir, aabbMin, aabbMax, vec2(0.001, closest));
    if (aabb_dist < 0.0) continue;

    int leftChild = int(data.x);

    if (leftChild == -1) {
      switch (u_mode) {
        case 1: //mode 1 - normal render
        int firstTri = int(data.y);
        int triCount = int(data.z);

        for (int i = 0; i < triCount; i++) {
          int baseIndex = (i + firstTri) * 5;
          vec3 posA = fetchModelData(baseIndex + 0);
          vec3 edgeAB = fetchModelData(baseIndex + 1);
          vec3 edgeAC = fetchModelData(baseIndex + 2);

          vec3 pvec = cross(r.direction, edgeAC);

          float determinant = dot(edgeAB, pvec);
          if (abs(determinant) < 1e-6) continue;

          float invDet = 1.0 / determinant;
          vec3 ao = r.origin - posA;

          float u = dot(ao, pvec) * invDet;
          if (u < 0.0 || u > 1.0) continue;

          vec3 dao = cross(ao, edgeAB);

          float v = dot(r.direction, dao) * invDet;
          if (v < 0.0 || u + v > 1.0) continue;

          float dist = dot(edgeAC, dao) * invDet;

          if (dist > ray_t.x && dist < closest) {
            closest = dist;
            closest_base_index = baseIndex;
            hit_anything = true;
          }
        }
        break;

        case 2: //mode 2 - bounding boxes of leafs
        hit_anything = true;
        rec.t = aabb_dist;
        rec.p = r.origin + r.direction * aabb_dist;
        rec.normal = vec3(0, 0, 1);
        rec.material.albedo = vec3(1, 0.1, 0.1);
        rec.material.ID = 2;
        rec.material.emission = vec4(0);
        return true;
      }
    } else {
      int rightChild = int(data.y);
      if (stackPtr >= 10) break;
      stack[stackPtr++] = leftChild;
      stack[stackPtr++] = rightChild;
    }
  }

  if (hit_anything) {
    vec3 normal = fetchModelData(closest_base_index + 3);
    vec3 color = fetchModelData(closest_base_index + 4);

    float determinant = -dot(r.direction, normal);

    rec.t = closest;
    rec.p = r.origin + r.direction * closest;
    rec.normal = normalize((determinant > 0.0) ? normal : -normal);
    if ((int(rec.p.x * 10) + int(rec.p.z * 10)) % 2 == 0 && color == vec3(1)) {
      rec.material.albedo = color;
    }
    else {
      rec.material.albedo = color * 0.5;
    }
    rec.material.ID = 0;
    rec.material.refractive_index = 1.5;
    rec.material.emission = vec4(0.0);
  }

  return hit_anything;
}

bool hit_sphere(ray r, sphere s, vec2 ray_t, out hit_record rec) {
  vec3 oc = r.origin - s.center;
  float h = dot(r.direction, oc);
  float c = dot(oc, oc) - s.radius * s.radius;

  float discriminant = h * h - c;
  if (discriminant < 0.0)
    return false;
  float sqrtd = sqrt(discriminant);

  float root = -h - sqrtd;
  if (root < ray_t.x || root > ray_t.y) {
    root = -h + sqrtd;
    if (root < ray_t.x || root > ray_t.y)
      return false;
  }

  rec.t = root;
  rec.p = r.origin + rec.t * r.direction;
  rec.normal = (rec.p - s.center) / s.radius;
  rec.material = s.mat;
  if (rec.material.textureID != 0) {
    vec3 localPos = normalize(rec.p - s.center);
    float phi = atan(-localPos.z, localPos.x) + PI;
    float theta = acos(-localPos.y);

    vec2 uv = vec2(phi / (2.0 * PI), theta / PI);

    rec.material.albedo = texture(u_texture, uv).rgb;
  }
  return true;
}

bool hit_plane(ray r, plane p, vec2 ray_t, out hit_record rec) {
  if (dot(r.direction, p.normal) < 0) {
    rec.t = dot(p.origin - r.origin, -p.normal) / dot(r.direction, -p.normal);
    if (rec.t < ray_t.x || rec.t > ray_t.y)
      return false;
    rec.p = r.origin + rec.t * r.direction;
    rec.normal = p.normal;
    rec.material = p.mat;
    if ((int(rec.p.x * 10) + int(rec.p.z * 10)) % 2 == 0 && p.mat.albedo == vec3(1)) {
      rec.material.albedo = vec3(0.5);
    }
    return true;
  }
  return false;
}

bool hit_world(ray r, vec2 ray_t, out hit_record rec) {
  hit_record temp_rec;
  bool hit_anything = false;
  float closest = ray_t.y;

  for (int i = 0; i < cornellBox.length(); i++) {
    if (hit_plane(r, cornellBox[i], vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }

  for (int i = 0; i < spheres.length(); i++) {
    if (hit_sphere(r, spheres[i], vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }

  #ifdef RENDER_3D_MODELS
  if (u_numTriangles > 0) {
    if (hit_3d_model(r, vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }
  #endif

  return hit_anything;
}

//==========SHADOW RAY HIT FUNCTIONS==========//

bool shadow_hit_3d_model(ray r, vec2 ray_t) {
  int stack[16];
  int stackPtr = 0;

  stack[stackPtr++] = 0;
  vec3 invRayDir = 1 / r.direction;
  while (stackPtr > 0) {
    int nodeIdx = stack[--stackPtr];

    int nodeDataIndex = u_bvhDataOffset + nodeIdx * 3;
    vec3 aabbMin = fetchModelData(nodeDataIndex + 0);
    vec3 aabbMax = fetchModelData(nodeDataIndex + 1);
    vec3 data = fetchModelData(nodeDataIndex + 2);

    float aabb_dist = hit_aabb_dist(r, invRayDir, aabbMin, aabbMax, ray_t);
    if (aabb_dist < 0.0) continue;

    int leftChild = int(data.x);

    if (leftChild == -1) {
      int firstTri = int(data.y);
      int triCount = int(data.z);

      for (int i = 0; i < triCount; i++) {
        int baseIndex = (i + firstTri) * 5;
        vec3 posA = fetchModelData(baseIndex + 0);
        vec3 edgeAB = fetchModelData(baseIndex + 1);
        vec3 edgeAC = fetchModelData(baseIndex + 2);

        vec3 pvec = cross(r.direction, edgeAC);

        float determinant = dot(edgeAB, pvec);
        if (abs(determinant) < 1e-6) continue;

        float invDet = 1.0 / determinant;
        vec3 ao = r.origin - posA;

        float u = dot(ao, pvec) * invDet;
        if (u < 0.0 || u > 1.0) continue;

        vec3 dao = cross(ao, edgeAB);

        float v = dot(r.direction, dao) * invDet;
        if (v < 0.0 || u + v > 1.0) continue;

        float dist = dot(edgeAC, dao) * invDet;

        if (dist > ray_t.x && dist < ray_t.y) {
          return true;
        }
      }
    } else {
      int rightChild = int(data.y);
      if (stackPtr >= 14) break;
      stack[stackPtr++] = leftChild;
      stack[stackPtr++] = rightChild;
    }
  }
  return false;
}

bool shadow_hit_sphere(ray r, sphere s, vec2 ray_t) {
  vec3 oc = r.origin - s.center;
  float h = dot(r.direction, oc);
  float c = dot(oc, oc) - s.radius * s.radius;

  float discriminant = h * h - c;
  if (discriminant < 0.0)
    return false;
  float sqrtd = sqrt(discriminant);

  float root = -h - sqrtd;
  if (root < ray_t.x || root > ray_t.y) {
    root = -h + sqrtd;
    if (root < ray_t.x || root > ray_t.y)
      return false;
  }

  return true;
}

bool shadow_hit_world(ray r, vec2 ray_t) {
  for (int i = 0; i < spheres.length(); i++) {
    if (shadow_hit_sphere(r, spheres[i], ray_t))
      return true;
  }
  for (int i = 0; i < cornellBox.length(); i++) {
    plane p = cornellBox[i];
    if (dot(r.direction, p.normal) < 0) {
      float t = dot(p.origin - r.origin, -p.normal) / dot(r.direction, -p.normal);
      if (t > ray_t.x && t < ray_t.y)
        return true;
    }
  }

  #ifdef RENDER_3D_MODELS
  if (u_numTriangles > 0) {
    if (shadow_hit_3d_model(r, ray_t)) {
      return true;
    }
  }
  #endif
  return false;
}

//==========RAY BOUNCING FUNCTION==========//

vec3 ray_color(ray r) {
  vec3 color = vec3(1.0);
  vec3 incoming_light = vec3(0);
  int MAX_BOUNCES = 5;
  for (int i = 0; i < MAX_BOUNCES; i++) {
    hit_record rec;
    if (hit_world(r, vec2(0.001, 10000), rec)) {
      //---------Lambertian material---------//
      if (rec.material.ID == 0) {
        if (dot(r.direction, rec.normal) > 0)
          break;

        if (random() < rec.material.reflection_chance) {
          vec3 reflected = reflect(r.direction, rec.normal);
          r = ray(rec.p, reflected);
          incoming_light += rec.material.emission.xyz * rec.material.emission.w * color;
          color *= rec.material.albedo;
          continue;
        }

        sphere light = spheres[0];
        vec3 light_point = light.center + random_on_unit_sphere() * light.radius;
        vec3 to_light = light_point - rec.p;
        float to_light_len_sq = to_light.x * to_light.x + to_light.y * to_light.y + to_light.z * to_light.z;
        ray shadow_ray = ray(rec.p, normalize(to_light));

        if (!shadow_hit_world(shadow_ray, vec2(0.001, length(light.center - rec.p) - light.radius - 0.001))) {
          float NdotL = max(dot(rec.normal, shadow_ray.direction), 0.0);
          float G = abs(dot(-to_light, (light_point - light.center) / light.radius)) / to_light_len_sq;
          incoming_light += light.mat.emission.rgb * light.mat.emission.w * rec.material.albedo * NdotL * color * G;
        }
        vec3 scatter_direction = 1.001 * rec.normal + random_on_unit_sphere();

        r = ray(rec.p, normalize(scatter_direction));
      }
      //----------Metal---------//
      else if (rec.material.ID == 1) {
        vec3 reflected = reflect(r.direction, rec.normal);
        r = ray(rec.p, reflected);
      }
      //-----------Glass----------//
      else if (rec.material.ID == 2) {
        if (MAX_BOUNCES < 10) MAX_BOUNCES++;

        float n = rec.material.refractive_index;
        float cos_theta = dot(r.direction, rec.normal); //angle of incidence
        if (cos_theta <= 0.0) { //ray comming from air
          float r0 = (1.0 - n) / (1.0 + n);
          r0 *= r0;
          float reflect_chance = r0 + (1.0 - r0) * pow(1.0 + cos_theta, 5.0);
          if (reflect_chance > random()) {
            r = ray(rec.p, reflect(r.direction, rec.normal));
          }
          else {
            r = ray(rec.p, refract(r.direction, rec.normal, 1 / n));
          }
        } else {
          float sin_sq_theta = 1 - cos_theta * cos_theta;
          if (sin_sq_theta >= 1.0 / (n * n)) {
            r = ray(rec.p, reflect(r.direction, -rec.normal));
          } else {
            vec3 refracted = refract(r.direction, -rec.normal, n);
            r = ray(rec.p, refracted);
          }
        }
      }
      //----------General----------//
      incoming_light += rec.material.emission.xyz * rec.material.emission.w * color;
      color *= rec.material.albedo;
    }
    else {
      float a = 0.5 * (r.direction.y + 1.0);
      incoming_light += 0.5 * color * ((1.0 - a) * vec3(1.0, 1.0, 1.0) + a * vec3(0.5, 0.7, 1.0));
      break;
    }
  }
  return incoming_light;
}

//==========MAIN FUNCTION==========//

void main()
{
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  seed = uint(u_seed) ^ uint(gl_FragCoord.x) * 1973u ^ uint(gl_FragCoord.y) * 9277u ^
      uint(u_frame) * 26699u;
  float aspect_ratio = u_resolution.x / u_resolution.y;

  vec3 origin = u_cameraPos;

  const float fov = radians(90.0f);
  const float flocal_length = 1.0 / tan(fov / 2.0);

  vec3 pixel_color = vec3(0.0);

  float u = ((gl_FragCoord.x - 0.5 + random()) / u_resolution.x) * 2.0 - 1.0;
  float v = ((gl_FragCoord.y - 0.5 + random()) / u_resolution.y) * 2.0 - 1.0;

  u *= aspect_ratio;

  vec3 direction = normalize(u * u_camRight + v * u_camUp + flocal_length * u_camFront);

  ray r = ray(origin, direction);
  pixel_color += ray_color(r);

  vec3 prevColor = texture(accumTexture, uv).rgb;

  vec3 finalColor = (prevColor * float(u_frame) + pixel_color) / float(u_frame + 1);
  FragColor = vec4((finalColor), 1.0);
}
