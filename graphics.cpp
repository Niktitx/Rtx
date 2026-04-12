#include "graphics.h"

int initialize() {
  if (!gladLoadGL(reinterpret_cast<GLADloadfunc>(sf::Context::getFunction))) {
    std::cerr << "Failed to initialize GLAD" << std::endl;
    return -1;
  }

  sf::ContextSettings settings;
  settings.attributeFlags = sf::ContextSettings::Default;
  settings.sRgbCapable = false;

  if (!ray_tracer.loadFromFile("fullscreen.vert", "ray_tracer.frag")) {
    std::cerr << "Failed to load shader";
    return 1;
  }
  if (!to_gamma.loadFromFile("fullscreen.vert", "to_gamma.frag")) {
    std::cerr << "Failed to load shader";
    return 1;
  }

  window.setMouseCursorVisible(false);

  ray_tracer.setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));
  to_gamma.setUniform("u_resolution", sf::Glsl::Vec2(WIDTH, HEIGHT));

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

  ray_tracer.setUniform("u_cameraPos", sf::Glsl::Vec3(CameraPos));
  ray_tracer.setUniform("u_camFront", sf::Glsl::Vec3(CameraFront));
  ray_tracer.setUniform("u_camRight", sf::Glsl::Vec3(CameraRight));
  ray_tracer.setUniform("u_camUp", sf::Glsl::Vec3(CameraUp));
  ray_tracer.setUniform("u_frame", frameCount++);
  ray_tracer.setUniform("simpleMode", simpleMode);
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
}

void clearScreen() {
  glClearColor(0, 0, 0, 1);
  glBindFramebuffer(GL_FRAMEBUFFER, fbos[0]);
  glClear(GL_COLOR_BUFFER_BIT);
  glBindFramebuffer(GL_FRAMEBUFFER, fbos[1]);
  glClear(GL_COLOR_BUFFER_BIT);
}
