# MD_Manager

## Pinning und Archivierung

#Version
- 0.7.0

#Date
- 07.08.2026 - 10.08.2026

### Bugs und Verbesserungen

#### Browserkompatibilität
- [x] ~Error-Notifications persistent machen + Kopieren der Meldung anbieten~
- [x] ~Ordentliche Fehlermeldungen anzeigen, wenn der Browser nicht unterstützt wird~

#### Hochkantmodus
- [x] ~Im Edit-Dialog werden Zeilenenden nicht korrekt umgebrochen und dargestellt~
- [x] ~Edit-Dialoge breiter machen~

#### Darstellung & Rendering
- [x] ~ToDo-Gruppierungen zeigen Trennlinie nur an, wenn zuvor ein ToDo im Task dargestellt wurde~
- [x] ~Stats und Backlog im Grid genau wie im Board rendern~
- [x] ~Golden Parsing-File an neue Features anpassen~

#### Leere Features/Tasks
- [x] ~Unnötige Leerzeilen entfernen => Drap-and-Drop muss weiter funktionieren~

### Feature-Karten

- [x] ~Edit- und Close-Button in Dot-Submenü packen, da weitere Buttons hinzukommen~

### Pinning

- [x] ~Anpinnen/Lösen von einem einzelnen Feature erlauben~
- [x] ~Neues Tag integrieren (+ Symbol)~
- [x] ~Springen zum Pin via Keyboard~
- [x] ~README ergänzen~

### Archiv

- [x] ~Archivierung von Features anbieten~
- [x] ~Neues Tag integrieren (+ Symbol)~
- [x] ~In Stats nachpflegen~
- [x] ~Anzeige und Toggle ähnlich zum Backlog~
- [x] ~README ergänzen~

## Zeitstrahl

#Version
- 0.7.1

#Date
- 11.08.2026 - 12.08.2026

### Bugs und Verbesserungen

- [x] ~Board => Workspace~
- [x] ~Grid => Wird abgeschafft und durchs Archiv ersetzt~
- [x] ~Breite des Backlogs anpassen~
- [x] ~Tabs im Help-Menü~
- [x] ~Screenshots automatisieren~
- [x] ~Release fertig machen~

### Archiv

- [x] ~Prototypischen Zeitstrahl zu einer vollwertigen Seite umbauen~
- [x] ~"Pseudo"-3D + visuell ansprechend~
- [x] ~README updaten~

#Pin
## Zoom und Suche

#Version
- 0.8.0

#Date
- 12.08.2026 - 14.08.2026

### Bugs und Verbesserungen

- [x] ~#Info und #Warn werden im Markdown an die falsche Stelle geschoben~
- [x] ~Abstände innerhalb von #Tags (oben und unten) sind nicht einheitlich~
- [x] ~Code-Review + lose Enden aufräumen~
- [x] ~Tests streamlinen~
- [x] ~Edit-Dialog im Hochkantmodus ist manchmal immer noch buggy~

#### Archiv
- [x] ~Zeiträume müssen im Archiv-Zeitstrahl auch dargestellt werden können~
- [x] ~Sortierung nach Datum und Version muss visuell dieselben Marker + Dots nutzen~
- [x] ~Vertikale Marker müssen in jedem Fall dieselbe Farbe + Dicke haben~
- [x] ~"Super-Dots" abschaffen~
- [x] ~Linien treffen manchmal nicht zentral den Dot auf der Timeline~
- [x] ~Linien haben weiterhin unter bestimmten Umständen verschiedene Farben/Dicke~
- [x] ~Snake-Modus in der Darstellung nach Datum wieder abklemmen (zu buggy)~
- [x] ~Umgang mit extrem großen Zeiträumen finden~
- [x] ~Zeitraum springt manchmal unnötig in die nächste Zeile~

### Zoom

#Info
Feature-Karten (und alles was daran/darin hängt) können breiter gemacht werden.
Stats und Backlog bleiben davon unberührt.

- [x] ~Zoomsymbol mit %-Angabe unten rechts integrieren~
- [x] ~Bei Click aktiviert dieses einen Slider~
- [x] ~Aktuelle Einstellung (380) ist der Default~
- [x] ~Zwei Vergrößerungen möglich (460/540) => fließender Übergang, direktes Rendering~
- [x] ~Wird sich für die geöffnete Datei persistent als neuer Default gemerkt~

### Suche

- [x] ~Fuzzy-Finding mit Echtzeitfilter~
- [x] ~Enter führt zu Navigation zur richtigen Stelle~

## Markdown-Erweiterungen

#Version
- 0.9.0

#Date
- TBD

### Bugs und Verbesserungen

### Markdown-Features

- [ ] Referenzen herstellen + hervorheben können
- [ ] Bilder unterstützen können
- [ ] Auch einen Umgang mit anderen Markdown-Features + Inline-HTML finden
- [ ] Live-Parsing mit Fehlermeldungen

### Markdown-Linting

- [ ] Nach Linting-Regeln importieren/exportieren
- [ ] Schalter im UI (Default = False)

## QoL-Verbesserungen für v1.0

#Version
- 1.0.0

#Date
- TBD

### Import/Export

- [ ] PDF-Report
- [ ] json

### Keyboard-Controls

- [ ] Ausbauen und vervollständigen

#Backlog
## Backlog

### Hosting und Deployment

- [ ] Anwendung zentral hosten

### Monetarisierung

- [ ] Coffee auf der Startseite
- [ ] Hosting/Deployment in der Premiumversion

### Mobile

- [ ] Mobilunterstützung ausarbeiten

#Archive
# Archive

## Prototyp

#Version
- 0.0.1

#Date
- 23.07.2026

### Anwendungsgrundlage

- [x] ~Erste lokale Anwendung erstellen~
- [x] ~Erstes Markdown-Projektlayout definieren~
- [x] ~Releases, Tasks, Progress und Status darstellen~

## Schichtenarchitektur

#Version
- 0.0.2

#Date
- 24.07.2026

### Anwendungsschichten

- [x] ~Grundlagenarchitektur überlegen~
- [x] ~Domain, UI, IO und Anwendungsverdrahtung trennen~
- [x] ~SortableJS lokal in `vendor/` ablegen~

### Board-Interaktion

- [x] ~Drag-and-Drop-Operationen über Domain-Aktionen ergänzen~
- [x] ~Löschfunktionen für Aufgaben und Features ergänzen~
- [x] ~Board-Layout und Interaktionsverhalten verfeinern~

## Datei-Workflow

#Version
- 0.0.3

#Date
- 24.07.2026

### Dateiverwaltung

- [x] ~Projektänderungen zurück in Markdown speichern~
- [x] ~Parsing und Serialisierung vom DOM unabhängig halten~

### Anwendungsoberfläche

- [x] ~Dateioperationen mit den Anwendungssteuerelementen verbinden~
- [x] ~Projektlogo ergänzen und Darstellung verfeinern~

## Grid-Ansicht

#Version
- 0.0.4

#Date
- 24.07.2026

### Alternatives Layout

- [x] ~Kompakte Grid-Ansicht zusätzlich zum Board ergänzen~
- [x] ~Feature- und Aufgabendarstellung an das Grid anpassen~
- [x] ~Responsives Layoutverhalten verfeinern~

## Backlog

#Version
- 0.0.5

#Date
- 25.07.2026

### Backlog-Workflow

- [x] ~Markdown-Backlog-Bereich parsen und serialisieren~
- [x] ~Backlog-Aufgaben in einer eigenen Seitenleiste darstellen~
- [x] ~Verschieben von Aufgaben zwischen Releases und Backlog ermöglichen~

## Bedienung

#Version
- 0.0.6

#Date
- 26.07.2026

### Steuerelemente

- [x] ~Steuerelemente der Anwendung erweitern~
- [x] ~Zustände und Interaktionsfeedback der Steuerelemente verbessern~
- [x] ~Board-Darstellung für aktive Steuerelemente verfeinern~

## Typografie

#Version
- 0.0.7

#Date
- 26.07.2026

### Schriftressourcen

- [x] ~Inter-Schrift lokal ablegen~
- [x] ~Lokale Schrift ohne Netzwerkzugriff anwenden~

## UI-Verfeinerung

#Version
- 0.0.8

#Date
- 26.07.2026

### Visuelles Verhalten

- [x] ~Darstellung von Board und Grid verbessern~
- [x] ~Kurze Oberflächenanimationen ergänzen~
- [x] ~Darstellung von Features, Aufgaben und Status verfeinern~

## Automatisierte Tests

#Version
- 0.0.9

#Date
- 26.07.2026

### Unit-Testabdeckung

- [x] ~Domain-Operationen mit deterministischen Node-Tests abdecken~
- [x] ~Markdown-Parsing und -Serialisierung abdecken~
- [x] ~Statusberechnungen und Zustandsübergänge verifizieren~

### Browser-Testabdeckung

- [x] ~Playwright-Integrationstests ergänzen~
- [x] ~Lokales Öffnen, Darstellen, Sortieren und Persistieren testen~

## Performance

#Version
- 0.0.10

#Date
- 26.07.2026

### Rendering-Performance

- [x] ~Unnötige Neudarstellungen der Anwendung reduzieren~
- [x] ~Layout- und Größenänderungsarbeiten bündeln~
- [x] ~Responsive Interaktionen mit repräsentativen Daten sicherstellen~

## Refactoring

#Version
- 0.0.11

#Date
- 26.07.2026

### Interne Bereinigung

- [x] ~Domain- und Persistenzverhalten refaktorieren~
- [x] ~Datei- und Statusverwaltung verbessern~
- [x] ~Regressionstestabdeckung für bestehendes Verhalten erweitern~

## Development Harness

#Version
- 0.0.12

#Date
- 27.07.2026

### Verifikationspipeline

- [x] ~Strikte JavaScript-Typprüfung mit TypeScript ergänzen~
- [x] ~ESLint-Verifikation ohne tolerierte Warnungen ergänzen~
- [x] ~Automatisierte Prüfung der Architekturgrenzen ergänzen~
- [x] ~Unit- und Playwright-Tests in npm run verify zusammenführen~

### Kontinuierliche Integration

- [x] ~Vollständige Verifikationspipeline in GitHub Actions ausführen~
- [x] ~Development Harness für Mitwirkende und Agenten dokumentieren~

## Gruvbox-Light-Theme

#Version
- 0.0.13

#Date
- 27.07.2026

### Theme-System

- [x] ~Anwendungsthemes über gemeinsame Tokens austauschbar machen~
- [x] ~Gruvbox-Light-Variante ergänzen~
- [x] ~Theme-Steuerung für Start- und Anwendungsansicht ergänzen~

## Bearbeitung

#Version
- 0.0.14

#Date
- 27.07.2026

### Feature-Bearbeitung

- [x] ~Feature-Titel im Board bearbeiten~
- [x] ~Feature-Metadaten in einem fokussierten Dialog bearbeiten~

### Aufgabenbearbeitung

- [x] ~Aufgabentitel, Markdown, Labels, Infos und Warnungen bearbeiten~
- [x] ~Einheitliches Verhalten für Speichern, Abbrechen, Schließen und Tastatur ergänzen~

## Erstellung und Hilfe

#Version
- 0.0.15

#Date
- 27.07.2026

### Elementerstellung

- [x] ~Neue Features über den Feature-Dialog erstellen~
- [x] ~Neue Aufgaben in Releases und Backlog erstellen~

### Hilfe

- [x] ~Tastaturkürzel in einer kompakten Hilfeansicht dokumentieren~
- [x] ~Feature-Tags, Metadaten, Labels und Backlog-Syntax erklären~
- [x] ~Ignore-Tags für Features und Aufgaben unterstützen~

## Erstes offizielles Release

#Version
- 0.1.0

#Date
- 27.07.2026

### Vereinheitlichtes Layout

- [x] ~Abmessungen von Board-Karten und Seitenleisten vereinheitlichen~
- [x] ~Abmessungen kompakter Grid-Karten und Seitenleisten vereinheitlichen~
- [x] ~Typografie, Abstände, Steuerelemente, Dialoge und Scrollbars abstimmen~

## QoL-Verbesserungen

#Version
- 0.2.0

#Date
- 28.07.2026 - 29.07.2026

### Formatanpassungen

- [x] ~Fließtext unter Labels parsen können~

### Clock

- [x] ~Clock implementieren~
- [x] ~Liegt oben in der Mitte~

### Notifications

- [x] ~Notificationsystem bauen (UI ähnlich zu Neovim)~
- [x] ~Notifications ergänzen~
- [x] ~Sounds ergänzen~

### Kopieren

- [x] ~Copy/Paste im UI von Features und Tasks~
- [x] ~Steuerung per Maus (Rechtsklick) und Tastatur (STRG + C/V)~
- [x] ~Smooth mit UI-Feedback~
- [x] ~Anzeige von gefülltem Zwischenspeicher~
- [x] ~Entsprechende Notification~

## Markdown besser editieren

#Version
- 0.3.0

#Date
- 30.07.2026

### Markdown-Features

- [x] ~Bold~
- [x] ~Kursiv~
- [x] ~Strikethrough~
- [x] ~URLs~
- [x] ~Quellcode~
- [x] ~####~
- [x] ~Einfach eingerückte Stichpunkte unterstützen~

### Edit-Dialog

- [x] ~Clunkyness verbessern~
- [x] ~Fokus, Navigation, Tastatursteuerung verbessern~
- [x] ~Editierfunktion ausbauen und komfortabler machen~
- [x] ~Tags in den normalen Markdown-Body integrieren~

### Tests

- [x] ~Ausbau von Layout.md mit Pseudodaten und allen unterstützten Features~

### Help

- [x] ~Im Edit-Dialog ergänzen~
- [x] ~Quick-Reference an die neuen Features anpassen~

## Dateisystem

#Version
- 0.4.0

#Date
- 03.08.2026

### Undo-System

- [x] ~Ein richtiges, vollständiges Undo-System integrieren~
- [x] ~Aktionsbasierte, reversible Domain-Transaktionen~
- [x] ~Korrektes Verwerfen von Redo-Zweigen~
- [x] ~Wiederherstellung von Ansichten~

### Externe Dateiänderungen

- [x] ~Detection~
- [x] ~Reload~
- [x] ~Overwrite~

### Vorlagen

- [x] ~"Create File"-Button auf der Startseite~
- [x] ~Lokale Templates für Tasks anbieten~

## Plattformunabhängigkeit

#Version
- 0.5.0

#Date
- 03.08.2026

### Vereinheitlichung

- [x] ~Plattformabhängige Stellen rausarbeiten und vereinheitlichen~
- [x] ~Lokale Monospace-Schrift ergänzen~
- [x] ~Normalisierung von Controls, Fokus, Selektion und Dialogen~
- [x] ~Stabilisierung von Scrollbars und Layoutmessungen~

### Tests

- [x] ~Windows-/Linux-/macOS-Testmatrix inklusive Geometrie- und Screenshottests~

### Symbole

- [x] ~Deterministische, rasterbasierte Symbole definieren~
- [x] ~Symbole lokal ablegen und Optik finalisieren~

### Logo

- [x] ~Neues Logo erstellen~
- [x] ~Überall einpflegen~

## Polishing

#Version
- 0.6.0

#Date
- 04.08.2026 - 07.08.2026

### UI

- [x] ~Headerbar anpassen~
- [x] ~Controls überall anpassen~
- [x] ~Größe von Sidebar und Stats~
- [x] ~Startseite anpassen~

### Interaktion

- [x] ~Klick auf Logo returned zur Startseite~

### Github

- [x] ~Ordentliche README im Stil der anderen Projekte erstellen~
- [x] ~Repository pflegen~
- [x] ~Release + Deployment neuer Versionen automatisieren~