#pragma once
#include "base.h"
#include <SFML/System/Vector3.hpp>

inline int frameCount = 0;
inline int current_buffer = 0;

inline GLuint emptyVAO;

inline uint modelTexture;

inline GLuint accumTextures[2];
inline GLuint fbos[2];

int initialize();
void render();
void clearScreen();
