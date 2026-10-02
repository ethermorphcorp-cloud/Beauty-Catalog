// Auth.gs — users, roles (admin/staff), login sessions and lockout.
// Users live in Script Properties (USERS); sessions live in the script cache.

const SESSION_TTL_SECONDS = 6 * 60 * 60;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const ROLES = ['admin', 'staff'];

// ---------- storage ----------

function readUsers_() {
  const raw = props_().getProperty('USERS');
  return raw ? JSON.parse(raw) : [];
}

function writeUsers_(users) {
  props_().setProperty('USERS', JSON.stringify(users));
}

function normalizeUsername_(username) {
  return String(username || '').trim().toLowerCase();
}

function findUser_(users, username) {
  const name = normalizeUsername_(username);
  return users.find((u) => u.username === name) || null;
}

function publicUser_(user) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || '',
  };
}

function validatePassword_(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw userError_('รหัสผ่านต้องมีอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัวอักษร');
  }
  if (password.length > PASSWORD_MAX_LENGTH) throw userError_('รหัสผ่านยาวเกินไป');
}

function hashPassword_(salt, password) {
  return sha256Hex_(salt + password);
}

/** Sets a new password and invalidates sessions issued before now. */
function setPassword_(user, password) {
  validatePassword_(password);
  user.salt = randomToken_();
  user.hash = hashPassword_(user.salt, password);
  user.passwordChangedAt = Date.now();
}

function newUser_(username, displayName, role, password) {
  const user = { username, displayName: displayName || username, role, createdAt: nowIso_(), lastLoginAt: '' };
  setPassword_(user, password);
  return user;
}

function passwordMatches_(user, password) {
  return typeof password === 'string' && password.length <= PASSWORD_MAX_LENGTH && safeEqual_(hashPassword_(user.salt, password), user.hash);
}

// ---------- sessions ----------

/** Returns the signed-in user (read fresh from USERS) or throws an auth error. */
function requireUser_(token, adminOnly) {
  const t = String(token || '');
  const raw = t && t.length <= 100 ? CacheService.getScriptCache().get('sess:' + t) : null;
  const session = raw ? JSON.parse(raw) : null;
  const user = session && findUser_(readUsers_(), session.u);
  if (!user || (user.passwordChangedAt && session.t < user.passwordChangedAt)) {
    throw userError_('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'auth');
  }
  if (adminOnly && user.role !== 'admin') throw userError_('เฉพาะ Admin เท่านั้นที่ทำรายการนี้ได้', 'forbidden');
  return user;
}

function login(username, password) {
  return respond_(() => {
    const name = normalizeUsername_(username);
    if (!USERNAME_PATTERN.test(name)) throw userError_('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'auth_failed');

    const cache = CacheService.getScriptCache();
    const failKey = 'fail:' + name;
    const fails = Number(cache.get(failKey) || 0);
    if (fails >= LOGIN_MAX_FAILS) {
      throw userError_('ใส่รหัสผ่านผิดหลายครั้ง ระบบล็อกชั่วคราว กรุณาลองใหม่ใน 15 นาที', 'locked');
    }

    const user = findUser_(readUsers_(), name);
    if (!user || !passwordMatches_(user, password)) {
      cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
      // Only existing usernames are logged so anonymous guesses cannot flood the AuditLog.
      if (user) withLock_(() => audit_(name, 'loginFailed', {}));
      throw userError_('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'auth_failed');
    }

    cache.remove(failKey);
    const token = randomToken_();
    cache.put('sess:' + token, JSON.stringify({ u: name, t: Date.now() }), SESSION_TTL_SECONDS);
    withLock_(() => {
      const users = readUsers_();
      const fresh = findUser_(users, name);
      if (fresh) {
        fresh.lastLoginAt = nowIso_();
        writeUsers_(users);
      }
      audit_(name, 'login', {});
    });
    return { token, user: publicUser_(user) };
  });
}

function logout(token) {
  return respond_(() => {
    const t = String(token || '');
    if (t && t.length <= 100) CacheService.getScriptCache().remove('sess:' + t);
    return true;
  });
}

function me(token) {
  return respond_(() => publicUser_(requireUser_(token)));
}

function changeMyPassword(token, oldPassword, newPassword) {
  return respond_(() => {
    const current = requireUser_(token);
    return withLock_(() => {
      const users = readUsers_();
      const user = findUser_(users, current.username);
      if (!passwordMatches_(user, oldPassword)) throw userError_('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      setPassword_(user, newPassword);
      writeUsers_(users);
      audit_(user.username, 'changePassword', { field: 'password' });
      // Keep the caller signed in with a fresh session; other sessions of this user end.
      const token2 = randomToken_();
      CacheService.getScriptCache().put('sess:' + token2, JSON.stringify({ u: user.username, t: Date.now() }), SESSION_TTL_SECONDS);
      return { token: token2 };
    });
  });
}

// ---------- user management (admin only) ----------

function listUsers(token) {
  return respond_(() => {
    requireUser_(token, true);
    return readUsers_().map(publicUser_);
  });
}

function createUser(token, input) {
  return respond_(() => {
    const admin = requireUser_(token, true);
    const data = input || {};
    const username = normalizeUsername_(data.username);
    if (!USERNAME_PATTERN.test(username)) throw userError_('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว');
    if (ROLES.indexOf(data.role) < 0) throw userError_('สิทธิ์ต้องเป็น admin หรือ staff');
    const displayName = String(data.displayName || '').trim().slice(0, 60);
    return withLock_(() => {
      const users = readUsers_();
      if (findUser_(users, username)) throw userError_('มีชื่อผู้ใช้ ' + username + ' แล้ว');
      const user = newUser_(username, displayName, data.role, data.password);
      users.push(user);
      writeUsers_(users);
      audit_(admin.username, 'createUser', { field: 'user', after: username + ' (' + user.role + ')' });
      return publicUser_(user);
    });
  });
}

function resetPassword(token, username, newPassword) {
  return respond_(() => {
    const admin = requireUser_(token, true);
    return withLock_(() => {
      const users = readUsers_();
      const user = findUser_(users, username);
      if (!user) throw userError_('ไม่พบผู้ใช้นี้', 'not_found');
      setPassword_(user, newPassword);
      writeUsers_(users);
      audit_(admin.username, 'resetPassword', { field: 'user', after: user.username });
      return publicUser_(user);
    });
  });
}

function deleteUser(token, username) {
  return respond_(() => {
    const admin = requireUser_(token, true);
    const name = normalizeUsername_(username);
    if (name === admin.username) throw userError_('ลบบัญชีของตัวเองไม่ได้');
    return withLock_(() => {
      const users = readUsers_();
      const user = findUser_(users, name);
      if (!user) throw userError_('ไม่พบผู้ใช้นี้', 'not_found');
      const remaining = users.filter((u) => u.username !== name);
      if (!remaining.some((u) => u.role === 'admin')) throw userError_('ต้องมี Admin อย่างน้อย 1 คน');
      writeUsers_(remaining);
      audit_(admin.username, 'deleteUser', { field: 'user', before: name + ' (' + user.role + ')' });
      return true;
    });
  });
}

/** Creates or resets an admin account. Used by the Sheet menu for first setup and recovery. */
function upsertAdmin_(username, password, actor) {
  const name = normalizeUsername_(username);
  if (!USERNAME_PATTERN.test(name)) throw userError_('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–30 ตัว');
  return withLock_(() => {
    const users = readUsers_();
    let user = findUser_(users, name);
    if (user) {
      setPassword_(user, password);
      user.role = 'admin';
      audit_(actor, 'resetPassword', { field: 'user', after: name + ' (admin)' });
    } else {
      user = newUser_(name, name, 'admin', password);
      users.push(user);
      audit_(actor, 'createUser', { field: 'user', after: name + ' (admin)' });
    }
    writeUsers_(users);
    return user;
  });
}
