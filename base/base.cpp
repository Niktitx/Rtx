#include "base.h"

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
      case sf::Keyboard::Scancode::R:
        simpleMode = 1 - simpleMode;
        CameraPos.y += 0.0000001f;
        break;
      }
    }

    if (event->is<sf::Event::FocusLost>())
      window.setMouseCursorVisible(true);
    if (event->is<sf::Event::FocusGained>())
      window.setMouseCursorVisible(false);
  }
}
