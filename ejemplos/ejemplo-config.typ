// Ejemplo: toda la configuración vive en el propio YAML (sección `config:`),
// barras con formatos especiales, subtareas ocultas por actividad y costos
// acumulables. Notar que acá no se pasa ningún parámetro: vienen del archivo.
#import "@local/gantt:0.1.0": carta-gantt

#show: carta-gantt(yaml("datos-config.yaml"))
