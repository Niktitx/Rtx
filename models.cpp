#include "models.h"
#include "base.h"
#include "third_party/glad/include/glad/gl.h"
#include <SFML/Graphics/Shader.hpp>
#include <SFML/System/Vector3.hpp>
#include <utility>
#define TINYOBJLOADER_IMPLEMENTATION
#include "graphics.h"
#include <tiny_obj_loader.h>

void updateNodeBounds(int nodeIdx) {
  BVHNode &node = bvhNodes[nodeIdx];
  node.aabbMin = sf::Vector3f(1e9f, 1e9f, 1e9f);
  node.aabbMax = sf::Vector3f(-1e9f, -1e9f, -1e9f);

  for (int i = 0; i < node.triCount; i++) {
    int triIdx = bvhTriIndices[node.firstTri + i];

    triangle tri = triangles[triIdx];

    node.aabbMin.x =
        std::min({node.aabbMin.x, tri.posA.x, tri.posB.x, tri.posC.x});
    node.aabbMin.y =
        std::min({node.aabbMin.y, tri.posA.y, tri.posB.y, tri.posC.y});
    node.aabbMin.z =
        std::min({node.aabbMin.z, tri.posA.z, tri.posB.z, tri.posC.z});

    node.aabbMax.x =
        std::max({node.aabbMax.x, tri.posA.x, tri.posB.x, tri.posC.x});
    node.aabbMax.y =
        std::max({node.aabbMax.y, tri.posA.y, tri.posB.y, tri.posC.y});
    node.aabbMax.z =
        std::max({node.aabbMax.z, tri.posA.z, tri.posB.z, tri.posC.z});
  }
}

float getAxisCoord(const sf::Vector3f &v, int axis) {
  switch (axis) {
  case 0:
    return v.x;
  case 1:
    return v.y;
  case 2:
    return v.z;
  }

  return 0;
}

void subDivide(int nodeIdx) {
  BVHNode &node = bvhNodes[nodeIdx];

  if (node.triCount <= 5) {
    node.leftChild = -1;
    return;
  }
  sf::Vector3f extend = node.aabbMax - node.aabbMin;
  int axis = 0;
  if (extend.y > extend.x)
    axis = 1;
  if (extend.z > extend.x && extend.z > extend.y)
    axis = 2;

  float splitPos =
      getAxisCoord(node.aabbMin, axis) + getAxisCoord(extend, axis) * 0.5f;

  int i = node.firstTri;
  int j = i + node.triCount - 1;
  while (i <= j) {
    int triIdx = bvhTriIndices[i];
    triangle &tri = triangles[triIdx];
    float centroid =
        (getAxisCoord(tri.posA, axis) + getAxisCoord(tri.posB, axis) +
         getAxisCoord(tri.posC, axis)) /
        3.0f;

    if (centroid < splitPos)
      i++;
    else {
      std::swap(bvhTriIndices[i], bvhTriIndices[j]);
      j--;
    }
  }

  int leftCount = i - node.firstTri;
  if (leftCount == 0 || leftCount == node.triCount) {
    leftCount = node.triCount / 2;

    // Вот тут неправильно раскидываются треугольники, если все с одной стороны
    // оказались

    i = node.firstTri + leftCount;
  }

  int leftChildIdx = bvhNodes.size();
  bvhNodes.push_back(BVHNode());
  bvhNodes[leftChildIdx].firstTri = node.firstTri;
  bvhNodes[leftChildIdx].triCount = leftCount;
  updateNodeBounds(leftChildIdx);
  subDivide(leftChildIdx);

  int rightChildIdx = bvhNodes.size();
  bvhNodes.push_back(BVHNode());
  bvhNodes[rightChildIdx].firstTri = i;
  bvhNodes[rightChildIdx].triCount = node.triCount - leftCount;
  updateNodeBounds(rightChildIdx);
  subDivide(rightChildIdx);

  node.leftChild = leftChildIdx;
  node.rightChild = rightChildIdx;
  node.triCount = 0;
}

void buildBVH() {
  bvhTriIndices.resize(numModelTriangles);
  for (int i = 0; i < numModelTriangles; i++)
    bvhTriIndices[i] = i;

  BVHNode root;
  root.leftChild = -1;
  root.firstTri = 0;
  root.triCount = numModelTriangles;
  bvhNodes.push_back(root);

  updateNodeBounds(0);
  subDivide(0);
}

void createModelTexData() {
  for (int i = 0; i < triangles.size(); i++) {
    const auto &t = triangles[bvhTriIndices[i]];

    sf::Vector3f edgeAB = t.posB - t.posA;
    sf::Vector3f edgeAC = t.posC - t.posA;

    sf::Vector3f normal(cross(edgeAB, edgeAC));

    modelTextureData.push_back(t.posA.x); // 1 vec3 - posA
    modelTextureData.push_back(t.posA.y);
    modelTextureData.push_back(t.posA.z);

    modelTextureData.push_back(edgeAB.x); // 2 vec3 - edgeAB
    modelTextureData.push_back(edgeAB.y);
    modelTextureData.push_back(edgeAB.z);

    modelTextureData.push_back(edgeAC.x); // 3 vec3 - edgeAC
    modelTextureData.push_back(edgeAC.y);
    modelTextureData.push_back(edgeAC.z);

    modelTextureData.push_back(normal.x); // 4 vec3 - normal
    modelTextureData.push_back(normal.y);
    modelTextureData.push_back(normal.z);

    modelTextureData.push_back(t.color.x); // 5 vec3 - color
    modelTextureData.push_back(t.color.y);
    modelTextureData.push_back(t.color.z);
  }

  int bvhDataOffset = numModelTriangles * 5;
  ray_tracer.setUniform("u_bvhDataOffset", bvhDataOffset);

  for (int i = 0; i < bvhNodes.size(); i++) { // goes after all triangles data
    BVHNode &node = bvhNodes[i];

    modelTextureData.push_back(node.aabbMin.x); // 1 vec3 - aabbMin
    modelTextureData.push_back(node.aabbMin.y);
    modelTextureData.push_back(node.aabbMin.z);

    modelTextureData.push_back(node.aabbMax.x); // 2 vec3 - aabbMax
    modelTextureData.push_back(node.aabbMax.y);
    modelTextureData.push_back(node.aabbMax.z);

    modelTextureData.push_back(
        node.leftChild); // 3 vec3 : if leaf(no childs): 1 float - leftChild id
    if (node.leftChild == -1) {
      modelTextureData.push_back(node.firstTri); // 2 float - first triangle id
      modelTextureData.push_back(
          node.triCount); // 3 float - triangles count in this node
    }

    else {

      modelTextureData.push_back(
          node.rightChild); // if not leaf (contains child nodes): 2 float -
                            // rightChild id
      modelTextureData.push_back(0.0f); // 3 float - just zero
    }
  }
}

int loadModel(const std::string &path) {
  tinyobj::ObjReaderConfig reader_config;
  reader_config.triangulate = true;
  tinyobj::ObjReader reader;

  if (!reader.ParseFromFile(path, reader_config)) {
    std::cerr << "TinyObjReader: " << reader.Error();
    return -1;
  }

  auto &attrib = reader.GetAttrib();
  auto &shapes = reader.GetShapes();

  sf::Vector3f defaultColor = white;

  for (size_t s = 0; s < shapes.size(); s++) {
    size_t index_offset = 0;

    for (size_t f = 0; f < shapes[s].mesh.num_face_vertices.size(); f++) {
      tinyobj::index_t idx0 = shapes[s].mesh.indices[index_offset + 0];
      tinyobj::index_t idx1 = shapes[s].mesh.indices[index_offset + 1];
      tinyobj::index_t idx2 = shapes[s].mesh.indices[index_offset + 2];

      sf::Vector3f posA(attrib.vertices[3 * idx0.vertex_index + 0],
                        attrib.vertices[3 * idx0.vertex_index + 1],
                        attrib.vertices[3 * idx0.vertex_index + 2]);

      sf::Vector3f posB(attrib.vertices[3 * idx1.vertex_index + 0],
                        attrib.vertices[3 * idx1.vertex_index + 1],
                        attrib.vertices[3 * idx1.vertex_index + 2]);

      sf::Vector3f posC(attrib.vertices[3 * idx2.vertex_index + 0],
                        attrib.vertices[3 * idx2.vertex_index + 1],
                        attrib.vertices[3 * idx2.vertex_index + 2]);

      triangles.push_back(triangle(posA, posB, posC, defaultColor, 0));
      index_offset += 3;
      numModelTriangles++;
    }
  }

  return 0;
}

int initializeModel() {

  if (loadModel("model.obj") != 0)
    return -1;
  buildBVH();
  createModelTexData();

  int texWidth = 1024;
  int pixelsPerTriangles = 5;
  int totalPixels =
      numModelTriangles * pixelsPerTriangles + bvhNodes.size() * 3;
  int texHeight = (totalPixels / texWidth) + 1;

  modelTextureData.resize(texWidth * texHeight * 3, 0.0f);

  glBindTexture(GL_TEXTURE_2D, modelTexture);

  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, texWidth, texHeight, 0, GL_RGB,
               GL_FLOAT, modelTextureData.data());
  glBindTexture(GL_TEXTURE_2D, 0);

  ray_tracer.setUniform("u_numTriangles", numModelTriangles);
  ray_tracer.setUniform("u_modelData", 1);

  return 0;
}
