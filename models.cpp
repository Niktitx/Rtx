#include "models.h"
#include "base.h"
#include "third_party/glad/include/glad/gl.h"
#include <SFML/Graphics/Shader.hpp>
#include <SFML/System/Vector3.hpp>
#define TINYOBJLOADER_IMPLEMENTATION
#include "graphics.h"
#include <tiny_obj_loader.h>

void initTriangles() {
  for (auto const &t : triangles) {
    sf::Vector3f edgeAB = t.posB - t.posA;
    sf::Vector3f edgeAC = t.posC - t.posA;

    sf::Vector3f normal(cross(edgeAB, edgeAC));

    triPosA.push_back(sf::Glsl::Vec3(t.posA));
    triEdgeAB.push_back(sf::Glsl::Vec3(edgeAB));
    triEdgeAC.push_back(sf::Glsl::Vec3(edgeAC));
    triNormal.push_back(sf::Glsl::Vec3(normal));
    triColor.push_back(sf::Glsl::Vec3(t.color));
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

  modelAABB.min = sf::Vector3f(1e9f, 1e9f, 1e9f);
  modelAABB.max = sf::Vector3f(-1e9f, -1e9f, -1e9f);

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

      modelAABB.min.x = std::min({modelAABB.min.x, posA.x, posB.x, posC.x});
      modelAABB.min.y = std::min({modelAABB.min.y, posA.y, posB.y, posC.y});
      modelAABB.min.z = std::min({modelAABB.min.z, posA.z, posB.z, posC.z});

      modelAABB.max.x = std::max({modelAABB.max.x, posA.x, posB.x, posC.x});
      modelAABB.max.y = std::max({modelAABB.max.y, posA.y, posB.y, posC.y});
      modelAABB.max.z = std::max({modelAABB.max.z, posA.z, posB.z, posC.z});

      sf::Vector3f edgeAB = posB - posA;
      sf::Vector3f edgeAC = posC - posA;

      sf::Vector3f normal(cross(edgeAB, edgeAC));

      modelTextureData.push_back(posA.x); // 1 vec3 - posA
      modelTextureData.push_back(posA.y);
      modelTextureData.push_back(posA.z);

      modelTextureData.push_back(edgeAB.x); // 2 vec3 - edgeAB
      modelTextureData.push_back(edgeAB.y);
      modelTextureData.push_back(edgeAB.z);

      modelTextureData.push_back(edgeAC.x); // 3 vec3 - edgeAC
      modelTextureData.push_back(edgeAC.y);
      modelTextureData.push_back(edgeAC.z);

      modelTextureData.push_back(normal.x); // 4 vec3 - normal
      modelTextureData.push_back(normal.y);
      modelTextureData.push_back(normal.z);

      modelTextureData.push_back(defaultColor.x); // 5 vec3 - defaultColor
      modelTextureData.push_back(defaultColor.y);
      modelTextureData.push_back(defaultColor.z);

      numModelTriangles++;
      index_offset += 3;
    }
  }

  modelAABB.min -= sf::Vector3f(0.01f, 0.01f, 0.01f);
  modelAABB.max += sf::Vector3f(0.01f, 0.01f, 0.01f);
  return 0;
}

int initializeModel() {

  if (loadModel("model.obj") != 0)
    return -1;
  int texWidth = 1024;
  int pixelsPerTriangles = 5;
  int totalPixels = numModelTriangles * pixelsPerTriangles;
  int texHeight = (totalPixels / texWidth) + 1;

  modelTextureData.resize(texWidth * texHeight * 3, 0.0f);

  glBindTexture(GL_TEXTURE_2D, modelTexture);

  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, texWidth, texHeight, 0, GL_RGB,
               GL_FLOAT, modelTextureData.data());
  glBindTexture(GL_TEXTURE_2D, 0);

  ray_tracer.setUniform("u_numTriangles", numModelTriangles);
  ray_tracer.setUniform("u_aabbMin", sf::Glsl::Vec3(modelAABB.min));
  ray_tracer.setUniform("u_aabbMax", sf::Glsl::Vec3(modelAABB.max));
  ray_tracer.setUniform("u_modelData", 1);

  initTriangles();
  ray_tracer.setUniformArray("u_triPosA", triPosA.data(), triPosA.size());
  ray_tracer.setUniformArray("u_triEdgeAB", triEdgeAB.data(), triEdgeAB.size());
  ray_tracer.setUniformArray("u_triEdgeAC", triEdgeAC.data(), triEdgeAC.size());
  ray_tracer.setUniformArray("u_triNormal", triNormal.data(), triNormal.size());
  ray_tracer.setUniformArray("u_triColor", triColor.data(), triColor.size());

  return 0;
}
