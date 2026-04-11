#version 330 core

uniform vec2 u_resolution;
uniform vec3 CameraPos;
uniform vec3 CameraRot;
uniform int u_frame;
uniform int u_seed;
uniform sampler2D accumTexture;

uniform sampler2D u_modelData;
uniform int u_numTriangles;
uniform vec3 u_aabbMin;
uniform vec3 u_aabbMax;

uniform vec3 u_triPosA[12];
uniform vec3 u_triEdgeAB[12];
uniform vec3 u_triEdgeAC[12];
uniform vec3 u_triNormal[12];
uniform vec3 u_triColor[12];

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
  int texWidth = 1024;
  int x = index % texWidth;
  int y = index / texWidth;
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
  int ID; // 0 - sharp, 1 - metal
  vec3 albedo;
  vec4 emission;
};

struct sphere {
  vec3 center;
  float radius;
  material mat;
};

const sphere spheres[1] = sphere[](
    // sphere(vec3(1.5, 0.0, -2.0), 0.5, material(0, vec3(0.8, 0.3, 0.3), vec4(0.8, 0.3, 0.3, 0))),
    sphere(vec3(0.5, 2.0, 0.0), 0.5, material(0, vec3(1), vec4(1, 1, 1, 0.5)))
  // sphere(vec3(-0.5, 0.0, -2.0), 0.5, material(0, vec3(0.3, 0.8, 0.3), vec4(0))),
  // sphere(vec3(-1.5, 0.0, -2.0), 0.5, material(0, vec3(0.3, 0.3, 0.7), vec4(0.0))),
  // sphere(vec3(0.0, -200.6, -1.0), 200.0, material(0, vec3(0.4, 0.4, 0.0), vec4(0.0)))

  );

bool hit_aabb(ray r, vec3 aabb_min, vec3 aabb_max, vec2 ray_t) {
  vec3 invD = 1.0 / (r.direction + 1e-8);
  vec3 t0 = (aabb_min - r.origin) * invD;
  vec3 t1 = (aabb_max - r.origin) * invD;

  vec3 tSmaller = min(t0, t1);
  vec3 tBigger = max(t0, t1);

  float tMin = max(ray_t.x, max(tSmaller.x, max(tSmaller.y, tSmaller.z)));
  float tMax = min(ray_t.y, min(tBigger.x, min(tBigger.y, tBigger.z)));

  return tMin < tMax;
}

bool hit_triangle(ray r, int i, vec2 ray_t, out hit_record rec) { //ray_t.x is min and ray_t.y is max distance allowed

  vec3 normal = u_triNormal[i];

  float determinant = -dot(r.direction, normal);

  if (abs(determinant) < 1e-6)
    return false;

  vec3 ao = r.origin - u_triPosA[i];
  vec3 dao = cross(ao, r.direction);
  float invDet = 1.0 / determinant;

  float u = dot(u_triEdgeAC[i], dao) * invDet;
  if (u < 0.0 || u > 1.0)
    return false;

  float v = -dot(u_triEdgeAB[i], dao) * invDet;
  if (v < 0.0 || v > 1.0 || u + v > 1.0)
    return false;

  float dist = dot(ao, normal) * invDet;
  if (dist < ray_t.x || dist > ray_t.y)
    return false;

  rec.p = r.origin + r.direction * dist;
  rec.normal = normalize((determinant > 0.0) ? normal : -normal);
  rec.t = dist;

  rec.materialId = 0;
  rec.albedo = u_triColor[i];
  rec.emission = vec4(0);
  return true;
}

bool hit_3d_model(ray r, vec2 ray_t, out hit_record rec) {
  if (!hit_aabb(r, u_aabbMin, u_aabbMax, ray_t)) {
    return false;
  }

  bool hit_anything = false;
  float closest = ray_t.y;
  hit_record temp_rec;

  for (int i = 0; i < u_numTriangles; i++) {
    // У нас 5 пикселей на треугольник
    int baseIndex = i * 5;
    vec3 posA = fetchModelData(baseIndex + 0);
    vec3 edgeAB = fetchModelData(baseIndex + 1);
    vec3 edgeAC = fetchModelData(baseIndex + 2);
    vec3 normal = fetchModelData(baseIndex + 3);
    vec3 color = fetchModelData(baseIndex + 4);

    // --- Стандартный алгоритм пересечения (Möller-Trumbore) ---
    float determinant = -dot(r.direction, normal);
    if (abs(determinant) < 1e-6) continue;

    float invDet = 1.0 / determinant;
    vec3 ao = r.origin - posA;
    vec3 dao = cross(ao, r.direction);

    float u = dot(edgeAC, dao) * invDet;
    if (u < 0.0 || u > 1.0) continue;

    float v = -dot(edgeAB, dao) * invDet;
    if (v < 0.0 || u + v > 1.0) continue;

    float dist = dot(ao, normal) * invDet;

    // --- Проверка дистанции ---
    if (dist > ray_t.x && dist < closest) {
      closest = dist;
      hit_anything = true;

      // Сохраняем данные успешного попадания
      rec.t = dist;
      rec.p = r.origin + r.direction * dist;
      rec.normal = normalize((determinant > 0.0) ? normal : -normal);
      rec.albedo = color;
      rec.materialId = 0; // Матовый
      rec.emission = vec4(0.0);
    }
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

  // for (int i = 0; i < spheres.length(); i++) {
  //   if (hit_sphere(r, spheres[i], vec2(ray_t.x, closest), temp_rec)) {
  //     hit_anything = true;
  //     closest = temp_rec.t;
  //     rec = temp_rec;
  //   }
  // }

  for (int i = 0; i < u_triNormal.length(); i++) {
    if (hit_triangle(r, i, vec2(ray_t.x, closest), temp_rec)) {
      hit_anything = true;
      closest = temp_rec.t;
      rec = temp_rec;
    }
  }
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
  int MAX_BOUNCES = 10;
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
        vec3 scatter_direction = normalize(rec.normal + random_in_unit_sphere());
        r = ray(rec.p, normalize(scatter_direction));
      } else if (rec.materialId == 1) {
        vec3 reflected = reflect(normalize(r.direction), rec.normal);
        r = ray(rec.p, reflected);
      }
      incoming_light += rec.emission.xyz * rec.emission.w * color;
      color *= rec.albedo;
    }
    else {
      vec3 unit_direction = normalize(r.direction);
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

  vec3 origin = CameraPos;
  vec3 horizontal = vec3(2.0 * aspect_ratio, 0.0, 0.0);
  vec3 vertical = vec3(0.0, 2.0, 0.0);

  float fov = 3.142592 / 2;
  float flocal_length = horizontal.x / 2 / tan(fov / 2);

  vec3 lower_left_corner = origin - horizontal / 2.0 - vertical / 2.0 - vec3(0.0, 0.0, flocal_length);

  int SAMPLES_PER_PIXEL = 1;
  vec3 pixel_color = vec3(0.0);

  for (int s = 0; s < SAMPLES_PER_PIXEL; s++) {
    float u = (gl_FragCoord.x - 0.5 + random()) / u_resolution.x;
    float v = (gl_FragCoord.y - 0.5 + random()) / u_resolution.y;
    vec3 temp_dir = normalize(lower_left_corner + u * horizontal + v * vertical - origin);
    vec3 direction = vec3(temp_dir.x * cos(CameraRot.y) - temp_dir.z * sin(CameraRot.y), temp_dir.y, temp_dir.x * sin(CameraRot.y) + temp_dir.z * cos(CameraRot.y));
    ray r = ray(origin, direction);
    pixel_color += ray_color(r);
  }

  pixel_color /= float(SAMPLES_PER_PIXEL);
  vec3 prevColor = texture(accumTexture, uv).rgb;

  // float weight = 1.0 / min(float(u_frame + 1), 200.0); // Никогда не усредняем больше чем 1/200
  //vec3 finalColor = mix(prevColor, pixel_color, weight);

  vec3 finalColor = (prevColor * float(u_frame) + pixel_color) / float(u_frame + 1);
  FragColor = vec4((finalColor), 1.0);
}
