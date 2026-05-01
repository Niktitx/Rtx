#pragma once
#include "../base/base.h"

inline sf::Vector3f prevPos = CameraPos;
inline bool cameraMoved = true;

void moveCamera(float dt);
