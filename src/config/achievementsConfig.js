module.exports = [
    {
        id: "first_lesson_watched",
        description: "Ver tu primera lección en cualquier programa",
        condition: (user) => {
            const totalCompletedLessons = Object.values(user.programs).flatMap(p => p.lessonsCompleted || []).length;
            return totalCompletedLessons >= 1;
        }
    }
];
