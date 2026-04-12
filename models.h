#pragma once
#include "base.h"

struct AABB {
  sf::Vector3f min, max;
};

inline std::vector<float> modelTextureData;
inline int numModelTriangles = 0;
inline AABB modelAABB;

inline std::vector<sf::Glsl::Vec3> triPosA;
inline std::vector<sf::Glsl::Vec3> triEdgeAB;
inline std::vector<sf::Glsl::Vec3> triEdgeAC;
inline std::vector<sf::Glsl::Vec3> triNormal;
inline std::vector<sf::Glsl::Vec3> triColor;

struct triangle {
  sf::Vector3f posA;
  sf::Vector3f posB;
  sf::Vector3f posC;
  sf::Vector3f color;
  float materialID;

  triangle(sf::Vector3f A, sf::Vector3f B, sf::Vector3f C, sf::Vector3f col,
           int m_id)
      : posA(A), posB(B), posC(C), color(col), materialID(m_id) {}
};

const std::vector<triangle>
    triangles({{{2.5, -0.5, -3}, {-2.5, -0.5, -3}, {2.5, -0.5, 1}, white, 1},
               {{-2.5, -0.5, -3}, {-2.5, -0.5, 1}, {2.5, -0.5, 1}, white, 0},
               {{2.5, -0.5, -3}, {2.5, 2, 1}, {2.5, 2, -3}, red, 0},
               {{2.5, -0.5, -3}, {2.5, -0.5, 1}, {2.5, 2, 1}, red, 0},
               {{2.5, -0.5, -3}, {-2.5, -0.5, -3}, {2.5, 2, -3}, blue, 0},
               {{-2.5, -0.5, -3}, {-2.5, 2, -3}, {2.5, 2, -3}, blue, 0},
               {{-2.5, -0.5, -3}, {-2.5, 2, 1}, {-2.5, 2, -3}, green, 0},
               {{-2.5, -0.5, -3}, {-2.5, -0.5, 1}, {-2.5, 2, 1}, green, 0},
               {{2.5, 2, -3}, {-2.5, 2, -3}, {2.5, 2, 1}, white, 0},
               {{-2.5, 2, -3}, {-2.5, 2, 1}, {2.5, 2, 1}, white, 0},
               {{2.5, -0.5, 1}, {-2.5, -0.5, 1}, {2.5, 2, 1}, blue, 0},
               {{-2.5, -0.5, 1}, {-2.5, 2, 1}, {2.5, 2, 1}, blue, 0}});

int loadModel(const std::string &path);
void initTriangles();
int initializeModel();
