const muxPlaybackIds = JSON.parse(process.env.NEXT_PUBLIC_MUX_IDS || "{}");

export const TIA_PROGRAM = {
    id: "tia",
    name: "TRENNO IA",
    description: "Programa intensivo especializado en el entrenamiento en inteligencia artificial para líderes de empresas y sus equipos.",
    sections: [
        {
            id: "session_1",
            name: "Introducción",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM01L01", title: "Introducción Microlearning TRENNO iA", longTitle: "Introducción Microlearning TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 347, muxPlaybackId: muxPlaybackIds["TIAM01L01"] ?? "" },
                        { id: "TIAM01L02", title: "Conceptos básicos para entender a la INTELIGENCIA ARTIFICIAL", longTitle: "Conceptos básicos para entender a la INTELIGENCIA ARTIFICIAL - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 555, muxPlaybackId: muxPlaybackIds["TIAM01L02"] ?? "" },
                        { id: "TIAM01L03", title: "Introducción al DISEÑO de PROMPTS - Parte 1", longTitle: "Introducción al DISEÑO de PROMPTS - Parte 1 - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 497, muxPlaybackId: muxPlaybackIds["TIAM01L03"] ?? "" },
                        { id: "TIAM01L04", title: "Introducción al DISEÑO de PROMPTS - Parte 2", longTitle: "Introducción al DISEÑO de PROMPTS - Parte 2 - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 585, muxPlaybackId: muxPlaybackIds["TIAM01L04"] ?? "" },
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
            ],
        },
        {
            id: "session_2",
            name: "Desarrollo",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM02L01", title: "Introducción a la Serie TRENNO iA", longTitle: "Introducción a la Serie TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM02L01"] ?? "" },
                    ],
                    instructions: [
                        {
                        id: "TMDM02I01",
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
            ],
        },
        {
            id: "session_3",
            name: "Cierre",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM03L01", title: "Introducción a la Serie TRENNO iA", longTitle: "Introducción a la Serie TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM03L01"] ?? "" },
                    ],
                    instructions: [
                        {
                        id: "TMDM03I01",
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
            ],
        }
    ],
};

export const TMD_PROGRAM = {
    id: "tmd",
    name: "TRENNO Mark Digital",
    description: "Programa especializado en organización digital y marketing para emprendedores.",
    sections: [
        {
            id: "session_1",
            name: "Introducción",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM01L01", title: "Introducción a la Serie TRENNO iA", longTitle: "Introducción a la Serie TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L01"] ?? "" },
                        { id: "TIAM01L02", title: "Conceptos básicos para entender a la INTELIGENCIA ARTIFICIAL", longTitle: "Conceptos básicos para entender a la INTELIGENCIA ARTIFICIAL - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L02"] ?? "" },
                        { id: "TIAM01L03", title: "Introducción al DISEÑO de PROMPTS - Parte 1", longTitle: "Introducción al DISEÑO de PROMPTS - Parte 1 - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L03"] ?? "" },
                        { id: "TIAM01L04", title: "Introducción al DISEÑO de PROMPTS - Parte 2", longTitle: "Introducción al DISEÑO de PROMPTS - Parte 2 - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L04"] ?? "" },
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
            ],
        },
        {
            id: "session_2",
            name: "Desarrollo",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM01L01", title: "Introducción a la Serie TRENNO iA", longTitle: "Introducción a la Serie TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L01"] ?? "" },
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
            ],
        },
        {
            id: "session_3",
            name: "Cierre",
            modules: [
                {
                    id: "TIAM01",
                    name: "Dominio de PROMPTS",
                    description: "Aprende a organizar tu empresa digitalmente con herramientas y estrategias avanzadas.",
                    lessons: [
                        { id: "TIAM01L01", title: "Introducción a la Serie TRENNO iA", longTitle: "Introducción a la Serie TRENNO iA - Dominio de PROMPTS | TRENNO IA", description: "Aprende los conceptos básicos de la inteligencia artificial y su aplicación en el mundo empresarial.", duration: 360, muxPlaybackId: muxPlaybackIds["TIAM01L01"] ?? "" },
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
            ],
        }
    ],
};

export const programs = [
  TIA_PROGRAM,
  TMD_PROGRAM
];