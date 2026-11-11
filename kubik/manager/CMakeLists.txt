# O gerenciador do Kubik: um app Qt pequeno (C++ + QML) que vai dentro do
# AppImage junto com o próprio Qt (scripts/manager-app.sh compila num Debian 13
# e junta as bibliotecas). Só QtQuick e QtQuick.Controls: nada do Plasma.
cmake_minimum_required(VERSION 3.16)
project(kubik-manager LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Core Gui Qml Quick QuickControls2)

# O QML, a lógica gerada do TypeScript (logic.js) e o ícone vão dentro do
# executável.
set(KUBIK_ICON "${CMAKE_CURRENT_SOURCE_DIR}/../../assets/kubik.svg")
configure_file("${KUBIK_ICON}" "${CMAKE_CURRENT_BINARY_DIR}/kubik.svg" COPYONLY)
configure_file(Main.qml "${CMAKE_CURRENT_BINARY_DIR}/Main.qml" COPYONLY)
configure_file(logic.js "${CMAKE_CURRENT_BINARY_DIR}/logic.js" COPYONLY)

qt_add_executable(kubik-manager main.cpp)
qt_add_resources(kubik-manager ui
    PREFIX /
    BASE "${CMAKE_CURRENT_BINARY_DIR}"
    FILES "${CMAKE_CURRENT_BINARY_DIR}/Main.qml"
          "${CMAKE_CURRENT_BINARY_DIR}/logic.js"
          "${CMAKE_CURRENT_BINARY_DIR}/kubik.svg")
target_link_libraries(kubik-manager PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::QuickControls2)

# As bibliotecas do Qt ficam em ../lib (dentro do AppImage). DT_RPATH (não
# RUNPATH) vale também para as dependências dos plugins carregados depois.
set_target_properties(kubik-manager PROPERTIES
    BUILD_RPATH "\$ORIGIN/../lib"
    INSTALL_RPATH "\$ORIGIN/../lib")
target_link_options(kubik-manager PRIVATE "-Wl,--disable-new-dtags")
