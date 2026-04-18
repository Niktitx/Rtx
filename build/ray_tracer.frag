#version 330 core

uniform vec2 u_resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_camFront;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform int u_frame;
uniform int u_seed;
uniform sampler2D accumTexture;
uniform int simpleMode;
uniform int u_bvhDataOffset;

uniform sampler2D u_modelData;
uniform int u_numTriangles;

uint seed;
out vec4 FragColor;

uint pcg_hash(uint x)
{
  x = x * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return x;
}

float random()
{
  seed = pcg_hash(seed);
  return float(seed) / 4294967295.0;
}

vec3 random_in_unit_sphere() {
  float a = random() * 2.0 * 3.141592;
  float z = random() * 2.0 - 1;
  float r = sqrt(1.0 - z * z);
  return vec3(r * cos(a), r * sin(a), z);
}

vec3 fetchModelData(int index) {
  int x = index & 1023;
  int y = index >> 10;
  return texelFetch(u_modelData, ivec2(x, y), 0).rgb;
}

struct ray {
  vec3 origin;
  vec3 direction;
};

struct hit_record {
  float t; //distance from ray origin
  vec3 p; //point of intersection in 3d space
  vec3 normal;
  int materialId;
  vec3 albedo;
  vec4 emission;
};

void set_face_normal(ray r, vec3 otwards_normal, inout hit_record rec) {
  bool front_face = dot(r.direction, otwards_normal) < 0;
  rec.normal = front_face ? otwards_normal : -otwards_normal;
}

struct material {
  int ID; // 0 - matte, 1 - metal, 2 - BVH visualization
  vec3 albedo;
  vec4 emission;
};

struct sphere {
  vec3 center;
  float radius;
  material mat;
};

const sphere spheres[4] = sphere[](
    sphere(vec3(0.5, 2.0, 0.0), 0.5, material(0, vec3(1), vec4(1, 1, 1, 0.25))),
    sphere(vec3(1.5, 0.0, -2.0), 0.5, material(0, vec3(0.8, 0.3, 0.3), vec4(0.8, 0.3, 0.3, 0))),
    sphere(vec3(-0.5, 0.0, -2.0), 0.5, material(2, vec3(0.3, 0.8, 0.3), vec4(0))),
    sphere(vec3(-1.5, 0.0, -2.0), 0.5, material(2, vec3(0.3, 0.3, 0.7), vec4(0.0)))
  // sphere(vec3(0.0, -200.6, -1.0), 200.0, material(0, vec3(0.4, 0.4, 0.0), vec4(0.0)))

  );

float hit_aabb_dist(ray r, vec3 aabb_min, vec3 aabb_max, vec2 ray_t) {
  vec3 invD = 1.0 / (r.direction + 1e-8);
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
  if (simpleMode == 1) {
    return false;
  }

  bool hit_anything = false;
  float closest = ray_t.y;
  int closest_base_index = -1;

  int stack[32];
  int stackPtr = 0;

  stack[stackPtr++] = 0;

  while (stackPtr > 0) {
    int nodeIdx = stack[--stackPtr];

    int nodeDataIndex = u_bvhDataOffset + nodeIdx * 3;
    vec3 aabbMin = fetchModelData(nodeDataIndex + 0);
    vec3 aabbMax = fetchModelData(nodeDataIndex + 1);
    vec3 data = fetchModelData(nodeDataIndex + 2);

    float aabb_dist = hit_aabb_dist(r, aabbMin, aabbMax, vec2(0.001, closest));
    if (aabb_dist < 0.0) continue;

    int leftChild = int(data.x);

    if (leftChild == -1) {
      // hit_anything = true;
      // rec.t = aabb_dist;
      // rec.p = r.origin + r.direction * aabb_dist;
      // rec.normal = vec3(0, 0, 1);
      // rec.albedo = vec3(1, 0.1, 0.1);
      // rec.materialId = 2;
      // rec.emission = vec4(0);
      // return true;

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
        if (v < 0.0 || u + v > 1.0 || v > 1.0) continue;

        float dist = dot(edgeAC, dao) * invDet;

        if (dist > ray_t.x && dist < closest) {
          closest = dist;
          closest_base_index = baseIndex;
          hit_anything = true;
        }
      }
    } else {
      int rightChild = int(data.y);
      if (stackPtr >= 30) break;
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
    rec.albedo = color;
    rec.materialId = 0;
    rec.emission = vec4(0.0);
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
  vec3 outwards_nomal = (rec.p - s.center) / s.radius;
  set_face_normal(r, outwards_nomal, rec);
  rec.materialId = s.mat.ID;
  rec.albedo = s.mat.albedo;
  rec.emission = s.mat.emission;
  return true;
}

bool hit_world(ray r, vec2 ray_t, out hit_record rec) {
  hit_record temp_rec;
  bool hit_anything = false;
  float closest = ray_t.y;

  for (int i = 0; i < spheres.length(); i++) {
    if (hit_sphere(r, spheres[i], vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }

  // for (int i = 0; i < u_triNormal.length(); i++) {
  //   if (hit_triangle(r, i, vec2(ray_t.x, closest), temp_rec)) {
  //     hit_anything = true;
  //     closest = temp_rec.t;
  //     rec = temp_rec;
  //   }
  // }
  //
  if (u_numTriangles > 0) {
    if (hit_3d_model(r, vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }

  return hit_anything;
}

vec4 sun = vec4(-500, 400, -300, 100);

vec3 ray_color(ray r) {
  vec3 color = vec3(1.0);
  vec3 incoming_light = vec3(0);
  int MAX_BOUNCES = 5;
  for (int i = 0; i < MAX_BOUNCES; i++) {
    hit_record rec;
    if (hit_world(r, vec2(0.001, 10000), rec)) {
      if (rec.materialId == 0) {
        sphere light = spheres[0]; //sphere(sun.xyz, sun.w, material(0, vec3(1), vec4(1)));

        ray shadow_ray = ray(rec.p, normalize(light.center + random_in_unit_sphere() * light.radius - rec.p));

        hit_record shadow_rec;
        if (!hit_world(shadow_ray, vec2(0.001, length(light.center - rec.p) - light.radius - 0.001), shadow_rec)) {
          float NdotL = max(dot(rec.normal, shadow_ray.direction), 0.0);
          incoming_light += light.mat.emission.rgb * light.mat.emission.w * rec.albedo * NdotL * color;
        }
        vec3 scatter_direction = rec.normal + random_in_unit_sphere();
        if (scatter_direction.x * scatter_direction.x + scatter_direction.y * scatter_direction.y + scatter_direction.z * scatter_direction.z < 1e-6)
          scatter_direction = rec.normal;
        r = ray(rec.p, normalize(scatter_direction));
      } else if (rec.materialId == 1) {
        vec3 reflected = reflect(r.direction, rec.normal);
        r = ray(rec.p, reflected);
      } else if (rec.materialId == 2) {
        r = ray(rec.p + r.direction * 0.001, r.direction);
        color *= rec.albedo;
        vec3 unit_direction = r.direction;
        float a = 0.5 * (unit_direction.y + 1.0);
        incoming_light += 0.5 * color * ((1.0 - a) * vec3(1.0, 1.0, 1.0) + a * vec3(0.5, 0.7, 1.0));
        break;
      }
      incoming_light += rec.emission.xyz * rec.emission.w * color;
      color *= rec.albedo;
    }
    else {
      vec3 unit_direction = r.direction;
      float a = 0.5 * (unit_direction.y + 1.0);
      incoming_light += 0.5 * color * ((1.0 - a) * vec3(1.0, 1.0, 1.0) + a * vec3(0.5, 0.7, 1.0));
      break;
    }
  }
  return incoming_light;
}

void main()
{
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  seed = uint(u_seed) ^ uint(gl_FragCoord.x) * 1973u ^ uint(gl_FragCoord.y) * 9277u ^
      uint(u_frame) * 26699u;
  float aspect_ratio = u_resolution.x / u_resolution.y;

  vec3 origin = u_cameraPos;

  float fov = radians(90.0f);
  float flocal_length = 1.0 / tan(fov / 2.0);

  int SAMPLES_PER_PIXEL = 1;
  vec3 pixel_color = vec3(0.0);

  for (int s = 0; s < SAMPLES_PER_PIXEL; s++) {
    float u = ((gl_FragCoord.x - 0.5 + random()) / u_resolution.x) * 2.0 - 1.0;
    float v = ((gl_FragCoord.y - 0.5 + random()) / u_resolution.y) * 2.0 - 1.0;

    u *= aspect_ratio;

    vec3 direction = normalize(u * u_camRight + v * u_camUp + flocal_length * u_camFront);

    ray r = ray(origin, direction);
    pixel_color += ray_color(r);
  }

  pixel_color /= float(SAMPLES_PER_PIXEL);
  vec3 prevColor = texture(accumTexture, uv).rgb;

  vec3 finalColor = (prevColor * float(u_frame) + pixel_color) / float(u_frame + 1);
  FragColor = vec4((finalColor), 1.0);
}
