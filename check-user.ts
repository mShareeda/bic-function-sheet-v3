import { prisma } from './lib/db';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@bic.local' }
  });

  console.log('User found:', !!user);
  if (user) {
    console.log('Email:', user.email);
    console.log('Display Name:', user.displayName);
    console.log('Is Active:', user.isActive);
    console.log('Has Password Hash:', !!user.passwordHash);
    console.log('Must Change Password:', user.mustChangePassword);
  } else {
    console.log('No user found with email admin@bic.local');
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
