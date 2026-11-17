// GM 계정 만들기 / 기존 계정을 GM으로 승격
//   npm run create-gm -- <아이디> <비밀번호>
//   npm run create-gm -- <아이디>          (이미 있는 계정을 GM으로)
import { Q } from "../server/db.js";
import { hashPassword, validatePassword, USERNAME_RE } from "../server/auth.js";

const [name, pass] = process.argv.slice(2);
if (!name || !USERNAME_RE.test(name)) { console.error("사용법: npm run create-gm -- <아이디> [비밀번호]"); process.exit(1); }
const u = Q.userByName.get(name);
if (u) {
  Q.setRole.run("gm", u.id);
  if (pass) {
    const err = validatePassword(pass);
    if (err) { console.error(err); process.exit(1); }
    Q.setPass.run(hashPassword(pass), u.id);
  }
  Q.deleteUserSessions.run(u.id);
  console.log(`${name} 계정을 GM으로 설정했어요.`);
} else {
  if (!pass) { console.error("새 계정은 비밀번호가 필요해요."); process.exit(1); }
  const err = validatePassword(pass);
  if (err) { console.error(err); process.exit(1); }
  Q.createUser.run(name, hashPassword(pass), "gm", Date.now());
  console.log(`GM 계정 ${name}을(를) 만들었어요.`);
}
