# Eternal Craft Launcher 0.70.6

- Separa las actualizaciones del launcher de las releases del modpack con el canal estable `launcher-latest`.
- Las releases `pack-v…` dejan de reemplazar la release “latest” del launcher; el workflow mantiene actualizados los metadatos y binarios Linux/Windows.
- El workflow de lanzamiento ejecuta las pruebas y verifica que el tag coincida con la versión de `package.json`.
- Las instalaciones antiguas migran su URL de actualización al canal dedicado sin sobrescribir feeds personalizados.
