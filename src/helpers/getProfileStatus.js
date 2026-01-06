const getProfileStatus = (user) => {
    if (user.username?.startsWith('google_')) return 'needs_username';
    const requiredFields = [
        user.profile?.name?.trim(),
        user.profile?.birthdate,
        user.profile?.country?.trim(),
        user.profile?.region?.trim(),
        user.enterprise?.name?.trim(),
        user.enterprise?.jobPosition?.trim(),
    ];

    const hasAllRequired = requiredFields.every(field => Boolean(field));
    if (!hasAllRequired) return 'needs_profile';
    return 'complete';
};

module.exports = { getProfileStatus };