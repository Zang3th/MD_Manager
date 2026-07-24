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
