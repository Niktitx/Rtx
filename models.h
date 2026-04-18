#pragma once
#include "base.h"
#include <SFML/System/Vector3.hpp>
#include <vector>

struct BVHNode {
  sf::Vector3f aabbMin, aabbMax;
  int leftChild = -1;
  int rightChild = -1;
  int firstTri = 0;
  int triCount = 0;
};

inline std::vector<BVHNode> bvhNodes;
inline std::vector<int> bvhTriIndices;

inline std::vector<float> modelTextureData;

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

inline std::vector<triangle>
    triangles; /*({{{2.5, -0.5, -3}, {-2.5, -0.5, -3}, {2.5, -0.5, 1}, white,
                1},
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
                  */

inline int numModelTriangles = triangles.size();

int loadModel(const std::string &path);
void createModelTexData();
int initializeModel();
