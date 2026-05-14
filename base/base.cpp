#include "base.h"
#include <SFML/System/Vector3.hpp>
#include <SFML/Window/Keyboard.hpp>

sf::Vector3f cross(const sf::Vector3f &a, const sf::Vector3f &b) {
  return sf::Vector3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z,
                      a.x * b.y - a.y * b.x);
}

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
      case sf::Keyboard::Scancode::Num0:
        mode = 0;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::Num1:
        mode = 1;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::Num2:
        mode = 2;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::Num3:
        mode = 3;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::Num4:
        mode = 4;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::Num5:
        mode = 5;
        CameraPos.y += 0.00001f;
        break;
      case sf::Keyboard::Scancode::R:
        CameraPos = sf::Vector3f(0, 0, 0);
        yaw = -90;
        pitch = 0;
        CameraPos.y += 0.00001f;
        break;
      }
    }

    if (event->is<sf::Event::FocusLost>())
      window.setMouseCursorVisible(true);
    if (event->is<sf::Event::FocusGained>())
      window.setMouseCursorVisible(false);
  }
}
