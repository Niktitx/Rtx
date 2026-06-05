#pragma once
#include "../base/base.h"

inline int frameCount = 0;
inline int current_buffer = 0;

inline GLuint emptyVAO;

inline uint modelTexture;

inline GLuint accumTextures[2];
inline GLuint fbos[2];

inline sf::Shader ray_tracer_simple;
inline sf::Shader ray_tracer;
inline sf::Shader *current_ray_tracer = nullptr;
inline sf::Shader to_gamma;

int initialize();
void render();
void clearScreen();
