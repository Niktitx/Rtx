#pragma once
#include "base.h"

inline sf::Vector3f prevPos = CameraPos;
inline bool cameraMoved = true;

void moveCamera(float dt);
