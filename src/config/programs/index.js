module.exports = {
    programs: [
        {
            id: "tia",
            modules: [
                {
                    id: "TIAM01",
                    lessons: [
                        { id: "TIAM01L01", durationSec: 347 },
                        { id: "TIAM01L02", durationSec: 347 },
                        { id: "TIAM01L03", durationSec: 555 },
                        { id: "TIAM01L04", durationSec: 497 },
                        { id: "TIAM01L05", durationSec: 585 },
                        { id: "TIAM01L06", durationSec: 434 },
                        { id: "TIAM01L07", durationSec: 582 },
                    ],
                    instructions: [
                        {
                            id: "TIAM01I01",
                            title: "Organiza tu carpeta principal",
                            description: "En esta instrucción vas a organizar la carpeta principal de tu negocio en Google Drive siguiendo las mejores prácticas que aprendiste en las lecciones anteriores.",
                            deliverableHint: "Sube una imagen clara que muestre tu estructura de carpetas en Drive.",
                            tools: ["Google Drive", "ChatGPT"],
                            steps: [
                                "Crear una cuenta en Google Drive, en caso de no tenerla.",
                                "Descargar Google Drive en su computadora.",
                                "Crear la carpeta principal de tu negocio con las áreas principales como subcarpetas.",
                                "Descargar la aplicación de Google Drive en tu celular y acceder a tu cuenta.",
                                "Dar acceso a los miembros de tu equipo a las carpetas correspondientes.",
                            ],
                            rewardXP: 600,
                            estimatedTimeSec: 900,
                            difficulty: "LOW",
                            afterLessonId: "TIAM01L05",
                            deliverableType: "file",
                            acceptedFormats: [".jpg", ".jpeg", ".png"],
                            maxFileSizeMB: 15,
                        },
                    ]
                },
                {
                    id: "TIAM02",
                    lessons: [
                        { id: "TIAM02L01", durationSec: 437 },
                        { id: "TIAM02L02", durationSec: 420 },
                        { id: "TIAM02L03", durationSec: 584 },
                        { id: "TIAM02L04", durationSec: 413 },
                        { id: "TIAM02L05", durationSec: 597 },
                        { id: "TIAM02L06", durationSec: 576 },
                        { id: "TIAM02L07", durationSec: 554 },
                        { id: "TIAM02L08", durationSec: 546 },
                        { id: "TIAM02L09", durationSec: 545 },
                        { id: "TIAM02L10", durationSec: 499 },
                        { id: "TIAM02L11", durationSec: 571 },
                        { id: "TIAM02L12", durationSec: 229 },
                        { id: "TIAM02L13", durationSec: 572 },
                        { id: "TIAM02L14", durationSec: 580 },
                    ],
                    instructions: [
                        {
                            id: "TIAM02I01",
                            title: "Instrucción placeholder 1",
                            description: "Esta es una instrucción placeholder para probar el flujo de instrucciones seguidas.",
                            deliverableHint: "Sube cualquier imagen de prueba.",
                            tools: ["ChatGPT"],
                            steps: [
                                "Paso 1 de prueba",
                                "Paso 2 de prueba",
                            ],
                            rewardXP: 300,
                            estimatedTimeSec: 300,
                            difficulty: "LOW",
                            afterLessonId: "TIAM02L05",
                            deliverableType: "file",
                            acceptedFormats: [".jpg", ".jpeg", ".png"],
                            maxFileSizeMB: 15,
                        },
                        {
                            id: "TIAM02I02",
                            title: "Instrucción placeholder 2",
                            description: "Esta es otra instrucción placeholder para probar el flujo de instrucciones seguidas.",
                            deliverableHint: "Sube cualquier imagen de prueba.",
                            tools: ["ChatGPT"],
                            steps: [
                                "Paso A de prueba",
                                "Paso B de prueba",
                            ],
                            rewardXP: 450,
                            estimatedTimeSec: 600,
                            difficulty: "MEDIUM",
                            afterLessonId: "TIAM02L05",
                            requiredActivityId: "TIAM02I01",
                            deliverableType: "file",
                            acceptedFormats: [".jpg", ".jpeg", ".png"],
                            maxFileSizeMB: 15,
                        },
                    ]
                },
            ]
        },
        {
            id: "tia_summer",
            modules: [
                {
                    id: "TIASM01",
                    lessons: [
                        { id: "TIASM01L01", durationSec: 347 },
                        { id: "TIASM01L02", durationSec: 347 },
                        { id: "TIASM01L03", durationSec: 555 },
                        { id: "TIASM01L04", durationSec: 497 },
                        { id: "TIASM01L05", durationSec: 585 },
                        { id: "TIASM01L06", durationSec: 434 },
                        { id: "TIASM01L07", durationSec: 582 },
                    ],
                    instructions: [
                        {
                            id: "TIASM01I01",
                            title: "Organiza tu carpeta principal",
                            description: "En esta instrucción vas a organizar la carpeta principal de tu negocio en Google Drive siguiendo las mejores prácticas que aprendiste en las lecciones anteriores.",
                            deliverableHint: "Sube una imagen clara que muestre tu estructura de carpetas en Drive.",
                            tools: ["Google Drive", "ChatGPT"],
                            steps: [
                                "Crear una cuenta en Google Drive, en caso de no tenerla.",
                                "Descargar Google Drive en su computadora.",
                                "Crear la carpeta principal de tu negocio con las áreas principales como subcarpetas.",
                                "Descargar la aplicación de Google Drive en tu celular y acceder a tu cuenta.",
                                "Dar acceso a los miembros de tu equipo a las carpetas correspondientes.",
                            ],
                            rewardXP: 600,
                            estimatedTimeSec: 900,
                            difficulty: "LOW",
                            afterLessonId: "TIASM01L05",
                            deliverableType: "file",
                            acceptedFormats: [".jpg", ".jpeg", ".png"],
                            maxFileSizeMB: 15,
                        },
                    ]
                },
                {
                    id: "TIASM02",
                    lessons: [
                        { id: "TIASM02L01", durationSec: 437 },
                        { id: "TIASM02L02", durationSec: 420 },
                        { id: "TIASM02L03", durationSec: 584 },
                        { id: "TIASM02L04", durationSec: 413 },
                        { id: "TIASM02L05", durationSec: 597 },
                        { id: "TIASM02L06", durationSec: 576 },
                        { id: "TIASM02L07", durationSec: 554 },
                        { id: "TIASM02L08", durationSec: 546 },
                        { id: "TIASM02L09", durationSec: 545 },
                        { id: "TIASM02L10", durationSec: 499 },
                        { id: "TIASM02L11", durationSec: 571 },
                        { id: "TIASM02L12", durationSec: 229 },
                        { id: "TIASM02L13", durationSec: 572 },
                        { id: "TIASM02L14", durationSec: 580 },
                    ],
                    instructions: []
                },
            ]
        },
        {
            id: "tmd",
            modules: [
                {
                    id: "TMDM01",
                    lessons: [
                        { id: "TMDM01L01", durationSec: 360 },
                        { id: "TMDM01L02", durationSec: 360 },
                        { id: "TMDM01L03", durationSec: 360 },
                        { id: "TMDM01L04", durationSec: 360 },
                    ],
                    instructions: [
                        {
                            id: "TMDM01I01",
                            title: "Organiza tu carpeta principal",
                            description: "En esta instrucción vas a organizar la carpeta principal de tu negocio en Google Drive siguiendo las mejores prácticas que aprendiste en las lecciones anteriores.",
                            deliverableHint: "Sube una imagen clara que muestre tu estructura de carpetas en Drive.",
                            tools: ["Google Drive", "ChatGPT"],
                            steps: [
                                "Crear una cuenta en Google Drive, en caso de no tenerla.",
                                "Descargar Google Drive en su computadora.",
                                "Crear la carpeta principal de tu negocio con las áreas principales como subcarpetas.",
                                "Descargar la aplicación de Google Drive en tu celular y acceder a tu cuenta.",
                                "Dar acceso a los miembros de tu equipo a las carpetas correspondientes.",
                            ],
                            rewardXP: 600,
                            estimatedTimeSec: 900,
                            difficulty: "LOW",
                            afterLessonId: "TMDM01L04",
                            deliverableType: "file",
                            acceptedFormats: [".jpg", ".jpeg", ".png"],
                            maxFileSizeMB: 15,
                        }
                    ]
                },
            ]
        }
    ]
};
