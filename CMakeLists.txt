# cmake_minimum_required(VERSION 3.10)
# project(RTX)
#
# set(CMAKE_CXX_STANDARD 17)
# set(CMAKE_CXX_STANDARD_REQUIRED ON)
#
# find_package(SFML 3.0 COMPONENTS Graphics Window System REQUIRED)
#
# add_executable(RTX 
#     main.cpp 
#
# )
#
#
# target_link_libraries(RTX PRIVATE SFML::Graphics SFML::Window SFML::System)
#
#
cmake_minimum_required(VERSION 3.10)
project(RTX)

# Добавляем путь к заголовочным файлам GLAD
include_directories(third_party/glad/include)

# Собираем программу вместе с glad.c
add_executable(rtx main.cpp third_party/glad/src/gl.c)

# Линкуем SFML и библиотеку dl (иногда нужна на Linux для загрузки OpenGL)
target_link_libraries(rtx sfml-graphics sfml-window sfml-system dl)
