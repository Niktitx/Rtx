#include "base.h"
#include "graphics.h"
#include "models.h"
#include "movement.h"
#include <SFML/System/Clock.hpp>

int main() {
  if (initialize() != 0)
    return -1;
  if (initializeModel() != 0)
    return -1;

  sf::Clock _clock;

  while (window.isOpen()) {
    getEvent(window);
    float dt = _clock.restart().asSeconds();
    moveCamera(dt);

    if (cameraMoved) {
      frameCount = 0;
      clearScreen();
    }

    render();

    std::cout << frameCount << "\t" << 1 / dt << std::endl;
  }
}
