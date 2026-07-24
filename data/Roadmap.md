# VK_Endevaour

## Learn Vulkan basics

#Version
- 0.0.0

#Date
- 23.08.24 - 29.08.24
- 25.09.24 - 15.11.24

#Info
- Learning Resources durcharbeiten
  - Begleitendes Git-Repo
  - Nebenbei Dokument mit Learnings pflegen
- Library mit Code aufbauen
  - Arbeite mit Asserts
- Arbeite am Anfang nur mit den allernotwendigsten Libraries
- Schaue auch kontinuierlich bei Hazel und EDBR rein um dir Orientierung zu verschaffen
- Ergänze dann Libraries nach und nach
- Projekt 1 : HelloCube (Drehendes 3D-Objekt mit ImGui-Anzeige)

### Allgemeines

- [x] ~SalinityGL README anpassen: Projekt wird erstmal nicht weiterentwickelt~
- [x] ~Neues Git-Repo "VK Endevaour" aufmachen (public)~
- [x] ~Passe die README an Linux allgemein an~

### Blogpost: Elias Daler

- [x] ~Durcharbeiten (100%)~
- [x] ~Dokument pflegen wo alle Erkenntnisse und offenen Fragen hinterlegt werden~

### Tutorial: Vulkan-Tutorial.com

#Warn
- Wayland: Window wird erst nach Commit eines Buffers sichtbar

**ToDo's**
- [x] ~0. Introduction~
- [x] ~1. Overview~
- [x] ~2. Development environment~
- [x] ~3.1.0 Drawing a Triangle / Setup / Base code~
- [x] ~3.1.1 Drawing a Triangle / Setup / Instance~
- [x] ~3.1.2 Drawing a Triangle / Setup / Validation layers~
- [x] ~Problem: Validation layer: loader_add_layer_properties: 'layers' tag not supported until file version 1.0.1 => .json manuell editiert~
- [x] ~Für die restlichen Probleme habe ich keinen Fix... Ich hab alles probiert: GLFW 3.4, Vulkan SDK 1.3.290, SDL2, Nvidia Treiber neu installiert, VkBootstrap - hat alles nix gebracht...~
- [x] ~Hole dir Access zu Hazel~
- [x] ~Füge SEVERITY_INFO_BIT_EXT hinzu~
- [x] ~Passe Logging entsprechend des Severity-Levels an~
- [x] ~Schaue dir Asserts an (Bestpractices bspw. in Hazel), ergänze Assert.hpp und passe die Applikation entsprechend an~
- [x] ~3.1.3 Drawing a Triangle / Setup / Physical devices and queue families~
- [x] ~Lookup code aus dem Header raushauen~
- [x] ~3.1.4 Drawing a Triangle / Setup / Logical device and queues~
- [x] ~3.2.0 Drawing a Triangle / Presentation / Window surface~
- [x] ~3.2.1 Drawing a Triangle / Presentation / Swap chain~
- [x] ~3.2.2 Drawing a Triangle / Presentation / Image views~
- [x] ~3.3.0 Drawing a Triangle / Graphics Pipeline Basics / Introduction~
- [x] ~3.3.1 Drawing a Triangle / Graphics Pipeline Basics / Shader modules~
- [x] ~3.3.2 Drawing a Triangle / Graphics Pipeline Basics / Fixed functions~
- [x] ~3.3.3 Drawing a Triangle / Graphics Pipeline Basics / Render passes~
- [x] ~3.3.4 Drawing a Triangle / Graphics Pipeline Basics / Conclusion~
- [x] ~3.4.0 Drawing a Triangle / Drawing / Framebuffers~
- [x] ~3.4.1 Drawing a Triangle / Drawing / Command buffers~
- [x] ~3.4.2 Drawing a Triangle / Drawing / Rendering and presentation~
- [x] ~3.4.3 Drawing a Triangle / Drawing / Frames in flight~
- [x] ~3.5 Drawing a Triangle / Swap chain recreation~
- [x] ~4.1 Vertex buffers / Vertex input description~
- [x] ~4.2 Vertex buffers / Vertex buffer creation~
- [x] ~4.3. Vertex buffers / Staging buffer~
- [x] ~4.4 Vertex buffers / Index buffer~
- [x] ~5.1 Uniform buffers / Descriptor layout and buffer~
- [x] ~5.2 Uniform buffers / Descriptor pool and sets~
- [x] ~Fix diesen weirden swap chain recreation bug => Lag daran, dass ich nicht immer die neuesten swap chain properties gefetched habe~
- [x] ~6.1 Texture mapping / Images~
- [x] ~6.2 Texture mapping / Image view and sampler~
- [x] ~6.3 Texture mapping / Combined image sampler~
- [x] ~7. Depth buffering~
- [x] ~8. Loading models~
- [x] ~9. Generating Mipmaps~
- [x] ~10. Multisampling~
- [x] ~ImGui integrieren (das ist die Baseline für das Projekt)~
- [x] ~Static-Analyisis über das Projekt laufen lassen~
- [x] ~Ausdruck in den Asserts in Klammern setzen (Auswertungsreihenfolge!)~

### Tutorial: TU Wien

- [x] ~0. First steps~
- [x] ~1. Swap Chain~
- [x] ~2. Resources and Descriptors~
- [x] ~3. Commands and Command Buffers~
- [x] ~4. Pipelines and Stages~

## Refactoring der Basics

#Version
- 0.0.1

#Date
- 23.04.25 - 19.05.25

### Allgemeines

- [x] ~Projekt erstellen (initiales Git-Repo)~
- [x] ~README.md schreiben~
- [x] ~CMake-Konfiguration aufsetzen (3 separare Files, Engine als Static-Library etc.)~
- [x] ~fmt inkludieren (als CMake-Subdirectory)~
- [x] ~Dünnen Logging-Wrapper mittels Defines bauen (Ergänzung von Levels via Farben und Uhrzeit)~
- [x] ~LSP funktioniert (CMake_EXPORT_COMPILE_COMMANDS)~
- [x] ~Vulkan SDK ans laufen kriegen~
- [x] ~GLFW ans laufen kriegen~
- [x] ~ChatGPT-Projekt aufsetzen~
- [x] ~Altes Projekt ans laufen kriegen~
- [x] ~Projekt aufräumen~
- [x] ~Vulkan Base Applikation erstellen (ordentlich, modular, verständlich) => API: https://x.com/SebAaltonen/status/1848311998376738892~
- [x] ~Designated struct initializers + structured bindings verwenden~
- [x] ~Imgui updaten~
- [x] ~VulkanMemoryAllocator integrieren~
- [x] ~VulkanSamples klonen~

### Core

- [x] ~Log implementieren~
- [x] ~Types implementieren~
- [x] ~Memory implementieren~
- [x] ~Window implementieren~

### Vulkan

- [x] ~VulkanAssert~
- [x] ~VulkanContext~
- [x] ~VulkanDebug + DebugMessenger (=> VulkanContext)~
- [x] ~vk::Instance (=> VulkanContext)~
- [x] ~vk::SurfaceKHR (=> VulkanContext)~
- [x] ~VulkanPhysicalDevice implementieren~
- [x] ~VulkanDevice implementieren~
- [x] ~VulkanSwapchain~
- [x] ~vk::Image + vk::ImageView (=> VulkanSwapchain)~
- [x] ~VulkanShader~
- [x] ~VulkanModel~
- [x] ~vk:Buffer und VmaAllocation (VulkanModel)~
- [x] ~vk::CommandPool~
- [x] ~vk::CommandBuffer~
- [x] ~VulkanPipeline~
- [x] ~DrawFrame()~
- [x] ~Shutdown-Prozess ordentlich tracken/loggen + fixen~
- [x] ~Swapchain refactoren~
- [x] ~Resize fixen~
- [x] ~Engine crashed wenn FRAMES_IN_FLIGHT =! 3~
- [x] ~Engine allokiert jeden Frame mehr Speicher => Fixen (Passiert bei mir bei allen Vulkan-Programmen. Scheint am GLFW Wayland-Layer zu liegen)~

### Graphics

- [x] ~Applikationsinterface definieren und erste API überlegen~
- [x] ~Ersten Rendererentwurf implementieren~

### Fixes

- [x] ~Richtige Types in Utility.cpp verwenden~
- [x] ~Das Device an den Allocator durchreichen~
- [x] ~Surface per const& an die Swapchain~
- [x] ~Grep nach uint32_t, int32_t, float und double~

### Kofi Game Engine Series

- [x] ~Video 0~
- [x] ~Video 2~
- [x] ~Video 3~
- [x] ~Video 5~
- [x] ~Video 6~
- [x] ~Video 7~
- [x] ~Video 8~
- [x] ~Video 9~
- [x] ~Video 11~
- [x] ~Video 12~
- [x] ~Video 13~
- [x] ~Video 14~
- [x] ~Video 15~
- [x] ~Video 16~
- [x] ~Video 17~

## Windows

#Version
- 0.1.0

#Date
- 09.12.25 - 06.01.26
- 21.05.26 - 05.06.26

### Allgemeines

**Software & Tooling**
- [x] ~RenderDoc~
- [x] ~Blender~
- [x] ~F3D~

**Project**
- [x] ~Vulkan SDK installieren (Winget)~
- [x] ~CheckDependencies.py schreiben (VulkanSDK, GLSLC, CMake, Clang++/Linker, Ninja) + alle Tools welche andere Skripte verwenden~
- [x] ~Einmal pro Woche das Projekt auf dem Laptop bauen~
- [x] ~LogStats.py schreiben~
- [x] ~BuildEngine.py schreiben (--debug, --release, --all, --clean)~
- [x] ~AnalyzeSources.py schreiben (--tidy, --verify)~
- [x] ~FormatFiles.py schreiben~

**Github**
- [x] ~README überarbeiten (u.A. mit Projektstruktur). Orientierung an SalinityGL~
- [x] ~Minimale build instructions für Windows und Linux hinzufügen (Voraussetzungen erläutern)~
- [x] ~Tags zum Repo hinzufügen~

### Bugs

- [x] ~Validation_Layer laufen auf 1.4.328 während die SDK schon auf 1.4.350 läuft => Alte SDKs müssen deinstalliert werden und man auch immer den neuesten Vulkan Configurator launchen~
- [x] ~Minimieren reparieren~
- [x] ~vkQueueSubmit(): Swapchain image 0 was presented but was not re-acquired => Unterschiedliche Plattformen erstellen unterschiedliche Menge an Bildern => WSI Image-Acquisition von VulkanFrame::Sync trennen~

### Improvements

- [x] ~Typo im Objloader.cpp~
- [x] ~Typo in README (Punkt fehlt bei vorletzter Zeile)~
- [x] ~std::source_location im Logging ergänzen~
- [x] ~Aufruf der Skripte ohne Params fixen~
- [x] ~Richtige Namespaces wie Engine::Core, Engine::Graphics etc. überall ergänzen~
- [x] ~Skript-Output besser formatieren~
- [x] ~RAD_Debugger Skript bauen~

#Info
- Kann ich das Logging verbessern oder muss alles zwangsläufig durch stderr laufen? => Läuft eh unter Windows nicht
- Wie spiele ich clangd Vorschläge ("fixes available") in Neovim ein? => code_action (ga)
