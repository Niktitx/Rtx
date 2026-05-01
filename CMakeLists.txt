cmake_minimum_required(VERSION 3.10)
project(RTX)

include_directories(third_party/glad/include)

add_executable(rtx main.cpp models/models.cpp base/base.cpp movement/movement.cpp graphics/graphics.cpp third_party/glad/src/gl.c)

target_link_libraries(rtx sfml-graphics sfml-window sfml-system dl)
