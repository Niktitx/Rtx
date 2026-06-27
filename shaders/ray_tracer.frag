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
uniform sampler2D u_normal_texture;

uint seed;
out vec4 FragColor;

//=====================================================//
//          DATA OPERATING AND MATH FUNCTIONS          //
//=====================================================//

const float PI = 3.14159265359;
const float EPS_RAY = 1e-4;
const float EPS_PDF = 1e-8;
const float EPS_D = 1e-20;
const float MIN_ROUGHNESS = 0.02;

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

vec3 makeTangent(vec3 N) {
  vec3 up = abs(N.y) < 0.999 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  return normalize(cross(up, N));
}

float alphaFromRoughness(float roughness) {
  float r = max(roughness, MIN_ROUGHNESS);
  return r * r;
}

bool makeHalfVector(vec3 V, vec3 L, out vec3 H) {
  vec3 s = V + L;
  float len2 = dot(s, s);

  if (len2 < 1e-12) {
    H = vec3(0.0);
    return false;
  }

  H = s * inversesqrt(len2);
  return true;
}

//==============================//
//          STRUCTURES          //
//==============================//

struct ray {
  vec3 origin;
  vec3 direction;
};

struct material {
  int ID; // 0 - Lambertian, 1 - Metal, 2 - Glass
  int textureID;
  vec3 albedo;
  float metallic;
  float roughness;
  vec4 emission; //r, g, b and emission power
  float refractive_index;
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

const vec3 white = vec3(1);
const vec3 red = vec3(0.8, 0.1, 0.1);
const vec3 green = vec3(0.1, 0.8, 0.1);
const vec3 blue = vec3(0.1, 0.1, 0.8);
const vec3 yellow = vec3(0.8, 0.8, 0.1);

#define Lambertian 0
#define Glass 1

const sphere spheres[5] = sphere[](
    sphere(vec3(0.0, 2.0, 0.0), 0.5, material(Lambertian, 0, white, 0, 1.0, vec4(1, 1, 1, 10), 1)),
    sphere(vec3(2, 0.0, 0.0), 0.5, material(Lambertian, 0, vec3(0.8, 0.1, 0.8), 0, 1.0, vec4(0), 1)),
    sphere(vec3(-0.5, 0.0, -1.0), 0.5, material(Glass, 0, white, 0, 1.0, vec4(0), 1.5)),
    sphere(vec3(1.0, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 1, 0.4, vec4(0), 1)),
    sphere(vec3(-1.5, 0.0, -2.0), 0.5, material(Lambertian, 0, red, 0, 0, vec4(0.0), 1))
  //sphere(vec3(0.0, 0.0, 0.0), 100, material(Lambertian, 1, white, 0, 0, vec4(0.0), 1))

  // sphere(vec3(-2, 0.0, -2.0), 0.5, material(Lambertian, 0, white, 1, 1, vec4(0.0), 1)),
  // sphere(vec3(-1, 0.0, -2.0), 0.5, material(Lambertian, 0, white, 0.75, 1, vec4(0.0), 1)),
  // sphere(vec3(0, 0.0, -2.0), 0.5, material(Lambertian, 0, white, 0.5, 1, vec4(0.0), 1)),
  // sphere(vec3(1, 0.0, -2.0), 0.5, material(Lambertian, 0, white, 0.25, 1, vec4(0.0), 1)),
  // sphere(vec3(2, 0.0, -2.0), 0.5, material(Lambertian, 0, white, 0, 1, vec4(0.0), 1)),
  //
  // sphere(vec3(-2, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 1, 0.75, vec4(0.0), 1)),
  // sphere(vec3(-1, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 0.75, 0.75, vec4(0.0), 1)),
  // sphere(vec3(0, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 0.5, 0.75, vec4(0.0), 1)),
  // sphere(vec3(1, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 0.25, 0.75, vec4(0.0), 1)),
  // sphere(vec3(2, 0.0, -1.0), 0.5, material(Lambertian, 0, white, 0, 0.75, vec4(0.0), 1)),
  //
  // sphere(vec3(-2, 0.0, 0.0), 0.5, material(Lambertian, 0, white, 1, 0.5, vec4(0.0), 1)),
  // sphere(vec3(-1, 0.0, 0.0), 0.5, material(Lambertian, 0, white, 0.75, 0.5, vec4(0.0), 1)),
  // sphere(vec3(0, 0.0, 0.0), 0.5, material(Lambertian, 0, white, 0.5, 0.5, vec4(0.0), 1)),
  // sphere(vec3(1, 0.0, 0.0), 0.5, material(Lambertian, 0, white, 0.25, 0.5, vec4(0.0), 1)),
  // sphere(vec3(2, 0.0, 0.0), 0.5, material(Lambertian, 0, white, 0, 0.5, vec4(0.0), 1)),
  //
  // sphere(vec3(-2, 0.0, 1.0), 0.5, material(Lambertian, 0, white, 1, 0.25, vec4(0.0), 1)),
  // sphere(vec3(-1, 0.0, 1.0), 0.5, material(Lambertian, 0, white, 0.75, 0.25, vec4(0.0), 1)),
  // sphere(vec3(0, 0.0, 1.0), 0.5, material(Lambertian, 0, white, 0.5, 0.25, vec4(0.0), 1)),
  // sphere(vec3(1, 0.0, 1.0), 0.5, material(Lambertian, 0, white, 0.25, 0.25, vec4(0.0), 1)),
  // sphere(vec3(2, 0.0, 1.0), 0.5, material(Lambertian, 0, white, 0, 0.25, vec4(0.0), 1)),
  //
  // sphere(vec3(-2, 0.0, 2.0), 0.5, material(Lambertian, 0, white, 1, 0, vec4(0.0), 1)),
  // sphere(vec3(-1, 0.0, 2.0), 0.5, material(Lambertian, 0, white, 0.75, 0, vec4(0.0), 1)),
  // sphere(vec3(0, 0.0, 2.0), 0.5, material(Lambertian, 0, white, 0.5, 0, vec4(0.0), 1)),
  // sphere(vec3(1, 0.0, 2.0), 0.5, material(Lambertian, 0, white, 0.25, 0, vec4(0.0), 1)),
  // sphere(vec3(2, 0.0, 2.0), 0.5, material(Lambertian, 0, white, 0, 0, vec4(0.0), 1))
  );

const plane cornellBox[1] = plane[](
    plane(vec3(0, -0.5, 0), vec3(0, 1, 0), material(Lambertian, 0, white, 0, 0.3, vec4(0), 1))
  // plane(vec3(0, 2, 0), vec3(0, -1, 0), material(Lambertian, 0, white, 1, 0.3, vec4(0), 1)),
  // plane(vec3(-2.5, 0, 0), vec3(1, 0, 0), material(Lambertian, 0, green, 1, 0, vec4(0), 1)),
  // plane(vec3(2.5, 0, 0), vec3(-1, 0, 0), material(Lambertian, 0, red, 1, 0, vec4(0), 1)),
  // plane(vec3(0, 0, -3), vec3(0, 0, 1), material(Lambertian, 0, blue, 1, 0, vec4(0), 1)),
  // plane(vec3(0, 0, 1), vec3(0, 0, -1), material(Lambertian, 0, white, 1, 0, vec4(0), 1))
  );

//=====================================//
//          RAY HIT FUNCTIONS          //
//=====================================//

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

  int stack[16];
  int stackPtr = 0;

  stack[stackPtr++] = 0;

  vec3 invRayDir = 1.0 / r.direction;

  while (stackPtr > 0) {
    int nodeIdx = stack[--stackPtr];

    int nodeDataIndex = u_bvhDataOffset + nodeIdx * 3; //fetching data of specific node
    vec3 aabbMin = fetchModelData(nodeDataIndex + 0);
    vec3 aabbMax = fetchModelData(nodeDataIndex + 1);
    vec3 data = fetchModelData(nodeDataIndex + 2);

    float aabb_dist = hit_aabb_dist(r, invRayDir, aabbMin, aabbMax, vec2(EPS_RAY, closest));
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
      if (stackPtr >= 14) break;
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
    rec.normal = (determinant > 0.0) ? normal : -normal;
    rec.material.albedo = color;
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
    float phi = -atan(localPos.z, localPos.x);
    float theta = acos(-localPos.y);

    vec2 uv = vec2((phi + PI) / (2 * PI), theta / PI);

    rec.material.albedo = texture(u_texture, uv).rgb;
    vec3 local_normal = texture(u_normal_texture, uv).rgb * 2 - vec3(1);
    local_normal.z = sqrt(1 - dot(local_normal.xy, local_normal.xy));
    vec3 N = rec.normal;

    vec3 up = abs(N.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 T = normalize(cross(up, N));
    rec.normal = local_normal.x * T + local_normal.y * cross(N, T) + local_normal.z * N;
    rec.normal = normalize(rec.normal);
  }
  return true;
}

bool hit_plane(ray r, plane p, vec2 ray_t, out hit_record rec) {
  float denom = dot(r.direction, p.normal);

  if (abs(denom) < 1e-6)
    return false;

  float t = dot(p.origin - r.origin, p.normal) / denom;

  if (t < ray_t.x || t > ray_t.y)
    return false;

  rec.t = t;
  rec.p = r.origin + t * r.direction;
  rec.normal = denom < 0.0 ? p.normal : -p.normal;
  rec.material = p.mat;

  float checker = mod(floor(rec.p.x * 10.0) + floor(rec.p.z * 10.0), 2.0);

  if (checker == 0.0 && p.mat.albedo == vec3(1.0) && rec.normal == vec3(0.0, 1.0, 0.0)) {
    //rec.material.albedo = vec3(0.5);
  }

  return true;
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

//============================================//
//          SHADOW RAY HIT FUNCTIONS          //
//============================================//

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

bool shadow_hit_world(ray r, vec2 ray_t, int light) {
  for (int i = 0; i < spheres.length(); i++) {
    if (i == light) continue;
    if (shadow_hit_sphere(r, spheres[i], ray_t))
      return true;
  }
  for (int i = 0; i < cornellBox.length(); i++) {
    plane p = cornellBox[i];

    float denom = dot(r.direction, p.normal);
    if (abs(denom) < 1e-6)
      continue;

    float t = dot(p.origin - r.origin, p.normal) / denom;

    if (t > ray_t.x && t < ray_t.y)
      return true;
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

//==================================//
//          BRDF FUNCTION           //
//==================================//

float D_GGX(float NdotH, float roughness) {
  float alpha2 = alphaFromRoughness(roughness);

  NdotH = clamp(NdotH, 0.0, 1.0);
  float denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(PI * denom * denom, EPS_D);
}

vec3 Fresnel_Schlick(float cos_theta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cos_theta, 5.0);
}

float G1_Smith(float NdotV, float roughness) {
  if (NdotV <= 0) return 0;
  float alpha = alphaFromRoughness(roughness);
  float alpha2 = alpha * alpha;
  float NdotV2 = NdotV * NdotV;

  return 2.0 * NdotV / max(NdotV + sqrt(alpha2 + (1.0 - alpha2) * NdotV2), EPS_PDF);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
  return G1_Smith(NdotV, roughness) * G1_Smith(NdotL, roughness);
}

vec3 BRDF(vec3 V, vec3 L, vec3 N, vec3 albedo, float metallic, float roughness) {
  vec3 H = vec3(0);
  makeHalfVector(V, L, H);
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float NdotH = max(dot(N, H), 0.0);

  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  vec3 F = Fresnel_Schlick(max(dot(H, V), 0.0), F0);
  float D = D_GGX(NdotH, roughness);
  float G = G_Smith(NdotV, NdotL, roughness);

  vec3 numerator = D * G * F;
  float denomenator = 4.0 * max(NdotV, 0.001) * max(NdotL, 0.001);
  vec3 specularBRDF = numerator / denomenator;

  vec3 kD = vec3(1.0) - F; //fraction of light that penetrates the material
  kD *= 1.0 - metallic;

  vec3 diffuseBRDF = albedo / PI;

  return kD * diffuseBRDF + specularBRDF;
}

vec3 sampleVNDF_local(vec3 V_local, float roughness) {
  float alpha = alphaFromRoughness(roughness);
  vec3 Vh = normalize(vec3(alpha * V_local.x, alpha * V_local.y, V_local.z));

  float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
  vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(lensq) : vec3(1, 0, 0);
  vec3 T2 = cross(Vh, T1);
  float r = sqrt(random());
  float phi = 2 * PI * random();
  float t1 = r * cos(phi);
  float t2 = r * sin(phi);
  float s = 0.5 * (1 + Vh.z);

  t2 = mix(sqrt(1 - t1 * t1), t2, s);

  vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0, 1 - t1 * t1 - t2 * t2)) * Vh;
  return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0, Nh.z)));
}

float eval_vndf_pdf(float NdotH, float NdotV, float roughness) {
  if (NdotV <= 0 || NdotH <= 0) return 0;
  float G1V = G1_Smith(NdotV, roughness);
  return D_GGX(NdotH, roughness) * G1V / max(4 * NdotV, EPS_PDF);
}

vec3 sampleCosineHemisphere(vec3 N) {
  float u1 = random();
  float u2 = random();

  float r = sqrt(u1);
  float phi = 2.0 * PI * u2;

  float x = r * cos(phi);
  float y = r * sin(phi);
  float z = sqrt(max(0.0, 1.0 - u1));

  vec3 T = makeTangent(N);
  vec3 B = cross(N, T);

  return normalize(x * T + y * B + z * N);
}

//================================================//
//          MULTIPLE IMPORTANCE SAMPLING          //
//================================================//

float power_heuristic(float pdf_a, float pdf_b) {
  float a2 = pdf_a * pdf_a;
  float b2 = pdf_b * pdf_b;
  float sum = a2 + b2;
  if (sum <= 0.0) return 0.0;

  return a2 / (sum);
}

float light_pdf(ray r, sphere light) {
  hit_record rec;
  if (!hit_sphere(r, light, vec2(EPS_RAY, 10000), rec)) return 0;

  float cos_light = dot(-r.direction, rec.normal);
  if (cos_light <= 0.0) return 0;

  float distance_sq = rec.t * rec.t;
  float area = 4 * PI * light.radius * light.radius;

  return distance_sq / max(area * cos_light, EPS_PDF);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float specularChoiceProbability(vec3 albedo, float metallic) {
  vec3 F0 = mix(vec3(0.04), albedo, metallic);

  float specW = max(luminance(F0), 1e-4);
  float diffW = luminance(albedo) * (1.0 - metallic);

  if (diffW <= 1e-6) return 1.0; // pure metal
  if (specW <= 1e-6) return 0.0;

  return clamp(specW / (specW + diffW), 0.05, 0.95);
}

//=========================================//
//          RAY BOUNCING FUNCTION          //
//=========================================//

vec3 ray_color(ray r) {
  vec3 color = vec3(1.0);
  vec3 incoming_light = vec3(0);
  int MAX_BOUNCES = 5;

  float prev_mis_weight = 1.0;

  for (int i = 0; i < MAX_BOUNCES; i++) {
    hit_record rec;
    if (hit_world(r, vec2(EPS_RAY, 10000), rec)) {
      if (rec.material.emission.w > 0.0) {
        incoming_light += rec.material.emission.rgb * rec.material.emission.w * prev_mis_weight * color;
        break;
      }

      //===========Lambertian material==========//
      if (rec.material.ID == Lambertian) {
        if (dot(r.direction, rec.normal) > 0)
          break;

        vec3 V = normalize(-r.direction);
        vec3 N = rec.normal;

        if (rec.material.metallic > 0.999 && rec.material.roughness <= 0) {
          vec3 L = reflect(r.direction, N);

          color *= rec.material.albedo;
          r = ray(rec.p + N * EPS_RAY, L);
          prev_mis_weight = 1.0;
          continue;
        }

        float roughness = max(rec.material.roughness, MIN_ROUGHNESS);
        float NdotV = dot(N, V);

        vec3 T = makeTangent(N);
        vec3 B = cross(N, T);
        vec3 V_local = vec3(dot(V, T), dot(V, B), NdotV);

        float p_spec = specularChoiceProbability(rec.material.albedo, rec.material.metallic);
        float p_diff = 1.0 - p_spec;

        sphere light = spheres[0];

        //----------Light sampling(NEE)----------//
        vec3 light_point = light.center + random_on_unit_sphere() * light.radius;
        vec3 to_light = light_point - rec.p;
        float dist2 = dot(to_light, to_light);
        vec3 L = to_light * inversesqrt(dist2);

        vec3 light_normal = normalize(light_point - light.center);
        float cos_light = dot(-L, light_normal);
        if (cos_light > 0.0) {
          float light_area = 4 * PI * light.radius * light.radius;
          float pdf_light = dist2 / max(light_area * cos_light, EPS_PDF);

          float NdotL = max(dot(N, L), 0.0);
          if (NdotL > 0) {
            ray shadow_ray = ray(rec.p + N * EPS_RAY, L);
            if (!shadow_hit_world(shadow_ray, vec2(0, length(to_light) - EPS_RAY), 0)) {
              float pdf_spec_nee = 0.0;
              vec3 H;
              if (makeHalfVector(V, L, H)) {
                float NdotH = max(dot(N, H), 0.0);
                pdf_spec_nee = eval_vndf_pdf(NdotH, NdotV, roughness);
              }

              float pdf_diff_nee = NdotL / PI;
              float pdf_brdf_nee = p_spec * pdf_spec_nee + p_diff * pdf_diff_nee;

              vec3 brdf_nee = BRDF(V, L, N, rec.material.albedo, rec.material.metallic, roughness);

              float mis_w = power_heuristic(pdf_light, pdf_brdf_nee);
              incoming_light += light.mat.emission.rgb * light.mat.emission.w * NdotL * color * brdf_nee * mis_w / pdf_light;
            }
          }
        }

        //----------Material sampling(BRDF)----------//

        vec3 scatter_direction;
        float pdf_path = 0;

        if (random() < p_spec) {
          //----------Specular----------//
          vec3 H_local = sampleVNDF_local(V_local, roughness);
          vec3 H = H_local.x * T + H_local.y * B + H_local.z * N;
          scatter_direction = reflect(-V, H);
          if (dot(scatter_direction, N) <= 0) break;

          float NdotH = max(dot(N, H), 0);

          float NdotL = max(dot(N, scatter_direction), 0);
          pdf_path = p_spec * eval_vndf_pdf(NdotH, NdotV, roughness) + p_diff * (NdotL / PI);
        } else {
          //----------Diffuse----------//
          scatter_direction = sampleCosineHemisphere(N);

          vec3 H;
          if (makeHalfVector(V, scatter_direction, H)) {
            float NdotH = max(dot(N, H), 0.0);
            float NdotL = max(dot(N, scatter_direction), 0);

            pdf_path = max(p_spec * eval_vndf_pdf(NdotH, NdotV, roughness), EPS_PDF) + p_diff * (max(NdotL, 0) / PI);
          }
        }

        float NdotL_path = max(dot(N, scatter_direction), 0.0);
        float pdf_light_for_brdf = light_pdf(ray(rec.p, scatter_direction), light);

        prev_mis_weight = power_heuristic(pdf_path, pdf_light_for_brdf);

        vec3 brdf_path = BRDF(V, scatter_direction, N, rec.material.albedo, rec.material.metallic, roughness);
        color *= brdf_path * NdotL_path / max(pdf_path, 0.00001);
        r = ray(rec.p + N * EPS_RAY, scatter_direction);
      }
      //============Glass===========//
      else if (rec.material.ID == Glass) {
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
        prev_mis_weight = 1.0;
        color *= rec.material.albedo;
      }
    }
    else {
      float a = 0.9 * (r.direction.y + 1.0);
      vec3 skyColor = (1.0 - a) * vec3(1.0, 1.0, 1.0) + a * vec3(0.5, 0.7, 1.0);
      incoming_light += skyColor * color * prev_mis_weight;
      break;
    }
  }
  return incoming_light;
}

//=================================//
//          MAIN FUNCTION          //
//=================================//

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
} //
