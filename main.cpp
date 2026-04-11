#include "third_party/glad/include/glad/gl.h"

#include <SFML/Graphics.hpp>
#include <SFML/Graphics/Glsl.hpp>
#include <SFML/Graphics/Shader.hpp>
#include <SFML/System/Vector3.hpp>
#include <SFML/Window/Keyboard.hpp>
#include <SFML/Window/Mouse.hpp>
#include <SFML/Window/Window.hpp>
#include <algorithm>
#include <iostream>
#include <random>

#define TINYOBJLOADER_IMPLEMENTATION
#include <tiny_obj_loader.h>
#include <vector>

std::mt19937 gen(std::random_device{}());
const int HEIGHT = 1080, WIDTH = 1920;
const float camera_velocity = 0.025;

sf::Vector3f CameraPos(0.0, 0.0, 1.0);
sf::Vector3f CameraRot(0.0, 0.0, -1.0);
bool CameraMove;

void getEvent(sf::RenderWindow &window) {
  while (const std::optional event = window.pollEvent()) {
    if (event->is<sf::Event::Closed>()) {
      window.close();
    }

    if (const auto *keyPressed = event->getIf<sf::Event::KeyPressed>()) {
      using sf::Keyboard::Scancode;

      switch (keyPressed->scancode) {
      case Scancode::Escape:
        window.close();
        break;
      case Scancode::W:
        CameraPos.z -= 0.25;
        CameraMove = true;
        break;
      case Scancode::A:
        CameraPos.x -= 0.25;
        CameraMove = true;
        break;
      case Scancode::S:
        CameraPos.z += 0.25;
        CameraMove = true;
        break;
      case Scancode::D:
        CameraPos.x += 0.25;
        CameraMove = true;
        break;
      case Scancode::Space:
        CameraPos.y += 0.25;
        CameraMove = true;
        break;
      case Scancode::LControl:
        CameraPos.y -= 0.25;
        CameraMove = true;
        break;
      case Scancode::Equal:
        break;
      case Scancode::Hyphen:
        break;
      }
    }
  }
}

void moveCamera() {
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::W)) {
    CameraPos += sf::Vector3f(camera_velocity * sin(CameraRot.x), 0,
                              camera_velocity * cos(CameraRot.x));
    CameraMove = true;
  }
}

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

sf::Vector3f white(0.5f, 0.5f, 0.5f);
sf::Vector3f red(0.8f, 0.1f, 0.1f);
sf::Vector3f green(0.1f, 0.8f, 0.1f);
sf::Vector3f blue(0.1f, 0.1f, 0.8f);

struct AABB {
  sf::Vector3f min, max;
};

std::vector<float> modelTextureData;
int numModelTriangles = 0;
AABB modelAABB;

void loadModel(const std::string &path) {
  tinyobj::ObjReaderConfig reader_config;
  reader_config.triangulate = true;
  tinyobj::ObjReader reader;

  if (!reader.ParseFromFile(path, reader_config)) {
    std::cerr << "TinyObjReader: " << reader.Error();
    return;
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

      sf::Vector3f normal(edgeAB.y * edgeAC.z - edgeAB.z * edgeAC.y,
                          edgeAB.z * edgeAC.x - edgeAB.x * edgeAC.z,
                          edgeAB.x * edgeAC.y - edgeAB.y * edgeAC.x);

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
}

// Массивы для передачи в шейдер (SoA)

std::vector<sf::Glsl::Vec3> triPosA;
std::vector<sf::Glsl::Vec3> triEdgeAB;
std::vector<sf::Glsl::Vec3> triEdgeAC;
std::vector<sf::Glsl::Vec3> triNormal;
std::vector<sf::Glsl::Vec3> triColor; // Допустим, альбедо

std::vector<triangle>
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

void initTriangles() {
  for (auto const &t : triangles) {
    // Временно создадим один из твоих старых треугольников как пример

    // Предрассчитываем векторы прямо в C++
    sf::Vector3f edgeAB = t.posB - t.posA;
    sf::Vector3f edgeAC = t.posC - t.posA;

    // Векторное произведение (Cross Product) считаем сами руками
    sf::Vector3f normal(edgeAB.y * edgeAC.z - edgeAB.z * edgeAC.y,
                        edgeAB.z * edgeAC.x - edgeAB.x * edgeAC.z,
                        edgeAB.x * edgeAC.y - edgeAB.y * edgeAC.x);

    // Записываем всё в массивы
    triPosA.push_back(sf::Glsl::Vec3(t.posA));
    triEdgeAB.push_back(sf::Glsl::Vec3(edgeAB));
    triEdgeAC.push_back(sf::Glsl::Vec3(edgeAC));
    triNormal.push_back(sf::Glsl::Vec3(normal));
    triColor.push_back(sf::Glsl::Vec3(t.color)); // Красный цвет
  }
}

int main() {

  sf::RenderWindow window(sf::VideoMode({WIDTH, HEIGHT}), "RTX");
  sf::RectangleShape screen({WIDTH, HEIGHT});

  if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(sf::Context::getFunction))) {
    std::cerr << "Failed to initialize GLAD" << std::endl;
    return -1;
  }

  // window.setFramerateLimit(10);

  sf::ContextSettings settings;
  settings.attributeFlags = sf::ContextSettings::Default;
  settings.sRgbCapable = false;

  sf::Vector2i mouse = sf::Mouse::getPosition(window);
  sf::Vector2i prev_mouse = mouse;

  sf::Shader ray_tracer;
  sf::Shader to_gamma;

  if (!ray_tracer.loadFromFile("fullscreen.vert", "ray_tracer.frag")) {
    std::cerr << "Failed to load shader";
    return 1;
  }
  if (!to_gamma.loadFromFile("fullscreen.vert", "to_gamma.frag")) {
    std::cerr << "Failed to load shader";
    return 1;
  }

  int frameCount = 0;
  int current_buffer = 0;
  CameraMove = false;

  std::uniform_int_distribution<int> dist(std::numeric_limits<int>::min(),
                                          std::numeric_limits<int>::max());
  ray_tracer.setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));
  to_gamma.setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));

  loadModel("model.obj");

  uint modelTexture;
  glGenTextures(1, &modelTexture);
  glBindTexture(GL_TEXTURE_2D, modelTexture);

  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

  int texWidth = 1024;
  int pixelsPerTriangles = 5;
  int totalPixels = numModelTriangles * pixelsPerTriangles;
  int texHeight = (totalPixels / texWidth) + 1;

  modelTextureData.resize(texWidth * texHeight * 3, 0.0f);

  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB32F, texWidth, texHeight, 0, GL_RGB,
               GL_FLOAT, modelTextureData.data());
  glBindTexture(GL_TEXTURE_2D, 0);

  ray_tracer.setUniform("u_numTriangles", numModelTriangles);
  ray_tracer.setUniform("u_aabbMin", sf::Glsl::Vec3(modelAABB.min));
  ray_tracer.setUniform("u_aabbMax", sf::Glsl::Vec3(modelAABB.max));

  ray_tracer.setUniform("u_modelData", 1);

  GLuint accumTextures[2];
  GLuint fbos[2];
  glGenTextures(2, accumTextures);
  glGenFramebuffers(2, fbos);

  for (int i = 0; i < 2; i++) {
    glBindTexture(GL_TEXTURE_2D, accumTextures[i]);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA32F, WIDTH, HEIGHT, 0, GL_RGBA,
                 GL_FLOAT, NULL);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    glBindFramebuffer(GL_FRAMEBUFFER, fbos[i]);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                           accumTextures[i], 0);
  }

  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  GLuint emptyVAO;
  glGenVertexArrays(1, &emptyVAO);

  // Перед циклом while(window.isOpen())
  initTriangles();
  ray_tracer.setUniformArray("u_triPosA", triPosA.data(), triPosA.size());
  ray_tracer.setUniformArray("u_triEdgeAB", triEdgeAB.data(), triEdgeAB.size());
  ray_tracer.setUniformArray("u_triEdgeAC", triEdgeAC.data(), triEdgeAC.size());
  ray_tracer.setUniformArray("u_triNormal", triNormal.data(), triNormal.size());
  ray_tracer.setUniformArray("u_triColor", triColor.data(), triColor.size());

  while (window.isOpen()) {
    getEvent(window);
    mouse = sf::Mouse::getPosition(window);

    CameraRot.y = ((float(mouse.x) / WIDTH) * 2 - 1) * 3.1415;
    if (CameraMove || mouse != prev_mouse) {
      glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
      glBindFramebuffer(GL_FRAMEBUFFER, fbos[0]);
      glClear(GL_COLOR_BUFFER_BIT);

      glBindFramebuffer(GL_FRAMEBUFFER, fbos[1]);
      glClear(GL_COLOR_BUFFER_BIT);

      CameraMove = false;
      frameCount = 0;
    }
    prev_mouse = mouse;
    int nextBuffer = 1 - current_buffer;

    ray_tracer.setUniform("CameraPos", sf::Glsl::Vec3(CameraPos));
    ray_tracer.setUniform("CameraRot", sf::Glsl::Vec3(CameraRot));
    ray_tracer.setUniform("u_frame", frameCount++);
    ray_tracer.setUniform("u_seed", dist(gen));

    glActiveTexture(GL_TEXTURE1);
    glBindTexture(GL_TEXTURE_2D, modelTexture);

    glBindFramebuffer(GL_FRAMEBUFFER, fbos[nextBuffer]);
    glViewport(0, 0, WIDTH, HEIGHT);

    sf::Shader::bind(&ray_tracer);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, accumTextures[current_buffer]);
    ray_tracer.setUniform("accumTexture", 0);

    glBindVertexArray(emptyVAO);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glBindVertexArray(0);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, window.getSize().x, window.getSize().y);
    window.clear();

    sf::Shader::bind(&to_gamma);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, accumTextures[nextBuffer]);
    to_gamma.setUniform("u_texture", 0);
    to_gamma.setUniform("u_resolution",
                        sf::Glsl::Vec2(window.getSize().x, window.getSize().y));

    glBindVertexArray(emptyVAO);
    glDrawArrays(GL_TRIANGLES, 0, 3);
    glBindVertexArray(0);

    window.display();
    current_buffer = nextBuffer;

    std::cout << frameCount << std::endl;
  }
}
