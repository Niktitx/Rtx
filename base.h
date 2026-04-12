#pragma once

#include "third_party/glad/include/glad/gl.h"
#include <SFML/Graphics.hpp>
#include <SFML/System/Vector3.hpp>
#include <SFML/Window/Window.hpp>
#include <algorithm>
#include <iostream>
#include <random>

const int HEIGHT = 1080, WIDTH = 1920;

const sf::Vector3f white(1.0f, 1.0f, 1.0f);
const sf::Vector3f red(0.8f, 0.1f, 0.1f);
const sf::Vector3f green(0.1f, 0.8f, 0.1f);
const sf::Vector3f blue(0.1f, 0.1f, 0.8f);

inline std::mt19937 gen(std::random_device{}());
inline std::uniform_int_distribution<int> dist(std::numeric_limits<int>::min(),
                                               std::numeric_limits<int>::max());
inline int simpleMode = 1;

inline sf::Vector3f CameraPos(0.0, 0.0, 0.0);
inline sf::Vector3f CameraUp(0.0, 1.0, 0.0);
inline sf::Vector3f CameraRight(1.0, 0.0, 0.0);
inline sf::Vector3f CameraFront(0.0, 0.0, 1.0);
const sf::Vector3f WorldUp(0.0, 1.0, 0.0);

inline float yaw = -90.0f;
inline float pitch = 0.0f;

inline bool firstMouse = true;

inline sf::RenderWindow window(sf::VideoMode({WIDTH, HEIGHT}), "RTX");
inline sf::Shader ray_tracer;
inline sf::Shader to_gamma;

sf::Vector3f cross(const sf::Vector3f &a, const sf::Vector3f &b);
void getEvent(sf::RenderWindow &window);
