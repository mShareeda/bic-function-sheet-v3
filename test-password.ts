import { prisma } from './lib/db';
import { verifyPassword } from './lib/password';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@bic.local' }
  });

  if (!user || !user.passwordHash) {
    console.log('User not found or no password hash');
    return;
  }

  const testPassword = 'h9TaX3g276CNFd'; // The generated password from seed

  console.log('Testing password verification...');
  console.log('Password to test:', testPassword);
  console.log('Password hash exists:', !!user.passwordHash);
  console.log('Password hash first 50 chars:', user.passwordHash.substring(0, 50));

  try {
    const isValid = await verifyPassword(user.passwordHash, testPassword);
    console.log('Password verification result:', isValid);
  } catch (err) {
    console.error('Error during verification:', err);
  }

  await prisma.$disconnect();
}

main();
