#include "movement.h"
#include <SFML/System/Vector2.hpp>
#include <SFML/Window/Mouse.hpp>

void moveCamera(float dt) {
  cameraMoved = false;
  sf::Vector2i mousePos = sf::Mouse::getPosition(window);
  sf::Vector2i center(window.getSize().x / 2, window.getSize().y / 2);

  if (!firstMouse) {
    sf::Mouse::setPosition(center, window);
    firstMouse = false;
  }

  else if (mousePos != center) {
    float xoffset = mousePos.x - center.x;
    float yoffset = center.y - mousePos.y;

    float sensitivity = 0.1f;
    xoffset *= sensitivity;
    yoffset *= sensitivity;

    yaw += xoffset;
    pitch += yoffset;

    pitch = fmin(pitch, 89.9f);
    pitch = fmax(pitch, -89.9f);

    sf::Vector3f front;
    front.x = cos(yaw * 3.14159f / 180.0f) * cos(pitch * 3.14159f / 180.0f);
    front.y = sin(pitch * 3.14159f / 180.0f);
    front.z = sin(yaw * 3.14159f / 180.0f) * cos(pitch * 3.14159f / 180.0f);
    CameraFront = front.normalized();
    CameraRight = cross(CameraFront, WorldUp).normalized();
    CameraUp = cross(CameraRight, CameraFront).normalized();

    sf::Mouse::setPosition(center, window);
    cameraMoved = true;
  }

  float cameraSpeed = 2.0f * dt;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::W))
    CameraPos += CameraFront * cameraSpeed;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::S))
    CameraPos -= CameraFront * cameraSpeed;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::A))
    CameraPos -= CameraRight * cameraSpeed;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::D))
    CameraPos += CameraRight * cameraSpeed;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::Space))
    CameraPos += WorldUp * cameraSpeed;
  if (sf::Keyboard::isKeyPressed(sf::Keyboard::Scancode::LControl))
    CameraPos -= WorldUp * cameraSpeed;

  if (CameraPos.x != prevPos.x || CameraPos.y != prevPos.y ||
      CameraPos.z != prevPos.z) {
    cameraMoved = true;
    prevPos = CameraPos;
  }
}
