#include "graphics.h"
#include <SFML/Graphics/Shader.hpp>
#include <SFML/System/Vector3.hpp>
#include <fstream>
#include <sstream>
#include <string>

#define STB_IMAGE_IMPLEMENTATION
#include "../third_party/stb_image.h"

unsigned int loadTexture(const char *path) {
  unsigned int textureID;
  glGenTextures(1, &textureID);
  int width, height, nrComponents;

  stbi_set_flip_vertically_on_load(true);

  unsigned char *data = stbi_load(path, &width, &height, &nrComponents, 0);
  if (data) {
    GLenum format;
    if (nrComponents == 1)
      format = GL_RED;
    else if (nrComponents == 3)
      format = GL_RGB;
    else if (nrComponents == 4)
      format = GL_RGBA;

    glBindTexture(GL_TEXTURE_2D, textureID);

    glTexImage2D(GL_TEXTURE_2D, 0, format, width, height, 0, format,
                 GL_UNSIGNED_BYTE, data);
    glGenerateMipmap(GL_TEXTURE_2D);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER,
                    GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    stbi_image_free(data);
  } else {
    std::cerr << "Failed to load texture: " << path << std::endl;
    stbi_image_free(data);
  }

  return textureID;
}

static std::string readFile(const std::string &path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    std::cerr << "Cannot open file: " << path << std::endl;
    return "";
  }
  std::ostringstream ss;
  ss << file.rdbuf();
  return ss.str();
}

static std::string injectDefines(const std::string &src,
                                 const std::string &defines) {
  if (defines.empty())
    return src;
  auto lineEnd = src.find('\n');
  if (lineEnd == std::string::npos)
    return src + "\n" + defines + "\n";
  return src.substr(0, lineEnd + 1) + defines + "\n" + src.substr(lineEnd + 1);
}

static bool loadShaderWithDefines(sf::Shader &shader,
                                  const std::string &vertSrc,
                                  const std::string &fragSrc,
                                  const std::string &defines) {
  std::string patchedFrag = injectDefines(fragSrc, defines);
  if (!shader.loadFromMemory(vertSrc, patchedFrag)) {
    std::cerr << "Shader compile error: Defines: [" << defines << "]\n";
    return false;
  }
  return true;
}

int initialize() {
  if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(sf::Context::getFunction))) {
    std::cerr << "Failed to initialize GLAD" << std::endl;
    return -1;
  }

  sf::ContextSettings settings;
  settings.attributeFlags = sf::ContextSettings::Default;
  settings.sRgbCapable = false;

  std::string vertSrc = readFile("../shaders/fullscreen.vert");
  std::string fragSrc = readFile("../shaders/ray_tracer.frag");

  if (vertSrc.empty() || fragSrc.empty())
    return -1;
  if (!loadShaderWithDefines(ray_tracer_simple, vertSrc, fragSrc, "")) {
    std::cerr << "Failed to compile simple shader\n";
    return -1;
  }
  if (!loadShaderWithDefines(ray_tracer, vertSrc, fragSrc,
                             "#define RENDER_3D_MODELS")) {
    std::cerr << "Failed to compile BVH shader\n";
    return -1;
  }

  for (sf::Shader *sh : {&ray_tracer_simple, &ray_tracer}) {
    sh->setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));
  }
  if (!to_gamma.loadFromFile("../shaders/fullscreen.vert",
                             "../shaders/to_gamma.frag")) {
    std::cerr << "Failed to load shader";
    return -1;
  }

  imageTexture = loadTexture("../build/texture.jpg");
  ray_tracer_simple.setUniform("u_texture", 2);
  ray_tracer.setUniform("u_texture", 2);

  window.setMouseCursorVisible(false);

  to_gamma.setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));

  current_ray_tracer = &ray_tracer_simple;

  glGenTextures(1, &modelTexture);
  glBindTexture(GL_TEXTURE_2D, modelTexture);

  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

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
  glGenVertexArrays(1, &emptyVAO);
  return 0;
}

void render() {
  int nextBuffer = 1 - current_buffer;
  current_ray_tracer = (mode == 0) ? &ray_tracer_simple : &ray_tracer;

  current_ray_tracer->setUniform("u_cameraPos", sf::Glsl::Vec3(CameraPos));
  current_ray_tracer->setUniform("u_camFront", sf::Glsl::Vec3(CameraFront));
  current_ray_tracer->setUniform("u_camRight", sf::Glsl::Vec3(CameraRight));
  current_ray_tracer->setUniform("u_camUp", sf::Glsl::Vec3(CameraUp));
  current_ray_tracer->setUniform("u_frame", frameCount++);
  current_ray_tracer->setUniform("u_mode", mode);
  current_ray_tracer->setUniform("u_seed", dist(gen));

  glActiveTexture(GL_TEXTURE1);
  glBindTexture(GL_TEXTURE_2D, modelTexture);

  glActiveTexture(GL_TEXTURE2);
  glBindTexture(GL_TEXTURE_2D, imageTexture);

  glBindFramebuffer(GL_FRAMEBUFFER, fbos[nextBuffer]);
  glViewport(0, 0, WIDTH, HEIGHT);

  sf::Shader::bind(current_ray_tracer);

  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, accumTextures[current_buffer]);
  current_ray_tracer->setUniform("accumTexture", 0);

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
}

void clearScreen() {
  glClearColor(0, 0, 0, 1);
  glBindFramebuffer(GL_FRAMEBUFFER, fbos[0]);
  glClear(GL_COLOR_BUFFER_BIT);
  glBindFramebuffer(GL_FRAMEBUFFER, fbos[1]);
  glClear(GL_COLOR_BUFFER_BIT);
}
