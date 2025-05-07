const muxPlaybackIds = JSON.parse(process.env.NEXT_PUBLIC_MUX_IDS || "{}");

const TMD_PROGRAM = {
  id: "TMD",
  name: "TRENNO Mark Digital",
  description: "Programa especializado en organización digital y marketing para emprendedores.",
  modules: [
    {
      id: "TMDM01",
      name: "Organización Digital",
      description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
      lessons: [
        { id: "TMDM01L01", title: "Introducción a la organización digital", longTitle: "Introducción a la organización digital - Organización Digital | TRENNO Mark Digital", duration: "10 min", muxPlaybackId: muxPlaybackIds["TMDM01L01"] ?? "" },
        { id: "TMDM01L02", title: "Herramientas esenciales para la digitalización", longTitle: "Herramientas esenciales para la digitalización - Organización Digital | TRENNO Mark Digital", duration: "15 min", muxPlaybackId: muxPlaybackIds["TMDM01L02"] ?? "" },
        { id: "TMDM01L03", title: "Automatización de procesos", longTitle: "Automatización de procesos - Organización Digital | TRENNO Mark Digital", duration: "12 min", muxPlaybackId: muxPlaybackIds["TMDM01L03"] ?? "" }
      ],
      instructions: [
        {
          id: "TMDM01I01",
          title: "Organiza tu carpeta principal",
          description: "Sube una captura de pantalla de cómo estructuraste tu carpeta de Google Drive.",
          difficulty: "LOW",
          rewardXP: 200,
          acceptedFormats: [".jpg", ".jpeg", ".png"],
          maxFileSizeMB: 15,
          steps: [
            "Crea una cuenta en Google Drive si aún no tienes una.",
            "Descarga la carpeta 'Tu Negocio' y súbela a tu Drive.",
            "Organiza las subcarpetas como se indica en la guía.",
            "Toma una captura de pantalla de tu estructura.",
            "Súbela en esta instrucción."
          ],
          deliverableHint: "Sube una imagen clara que muestre tu estructura de carpetas en Drive."
        }
      ]
    },
  ]
};

module.exports = { TMD_PROGRAM };