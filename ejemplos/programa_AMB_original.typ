// Carta Gantt del Programa de Análisis Ambiental (Fases 1-6), datos tomados
// del rango "Programa_AMB" de datos_para_gantt_AMB.xlsx.
#import "@local/gantt:0.1.0": carta-gantt

#show: carta-gantt(yaml("programa_AMB_original.yaml"),
ventana-inicio: "2026-07-01",
ventana-fin: "2027-04-30",
)
