export function studioUser(user) {
  // user_metadata is user-editable; it is used only as a display label.
  if (!user?.id || user.is_anonymous || user.app_metadata?.studio_access !== true) return null;
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return null;
  return {
    id: user.id,
    username: user.email || user.id,
    name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : user.email || '受邀读者',
  };
}

export async function verifiedStudioUser(client) {
  try {
    // A fresh server lookup also observes administrator access revocation.
    const { data, error } = await client.auth.getUser();
    return error ? null : studioUser(data?.user);
  } catch { return null; }
}
