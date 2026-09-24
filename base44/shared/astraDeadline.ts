export async function beforeDeadline(operation, deadline, message) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(message);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), remaining); })
    ]);
  } finally { clearTimeout(timer); }
}