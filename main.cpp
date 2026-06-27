#include "base/base.h"
#include "graphics/graphics.h"
#include "models/models.h"
#include "movement/movement.h"
#include <SFML/System/Clock.hpp>
#include <random>

int main() {
  if (initialize() != 0)
    return -1;
  if (initializeModel() != 0)
    return -1;

  sf::Clock _clock;

  int fps_arr[16];
  std::fill(std::begin(fps_arr), std::end(fps_arr), 0);

  while (window.isOpen()) {
    getEvent(window);
    float dt = _clock.restart().asSeconds();
    moveCamera(dt);

    if (cameraMoved) {
      frameCount = 0;
      clearScreen();
    }

    render();
    fps_arr[frameCount % 16] = 1 / dt;
    float fps = 0;
    for (int i = 0; i < 16; i++)
      fps += fps_arr[i];
    fps /= 16;

    std::cout << frameCount << "\t" << fps << std::endl;
  }
}
