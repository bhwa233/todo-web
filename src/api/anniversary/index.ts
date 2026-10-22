'use server';
import { requireAdmin } from '../../lib/auth';
import { Anniversary } from '@prisma/client';
import prisma from '../prisma';


export const getAnniversary = async (): Promise<Anniversary[]> => {
  await requireAdmin();
  return await prisma.anniversary.findMany({
    orderBy: {
      date: 'desc',
    },
    take: 100,
  });
};

export interface NewAnniversary {
  name: string;
  date: Date;
}
export const createNewAnniversary = async (data: NewAnniversary) => {
  await requireAdmin();
  return await prisma.anniversary.create({
    data: {
      ...data,
      remark: '',
    },
  });
};
export const deleteAnniversary = async (id: string) => {
  await requireAdmin();
  return await prisma.anniversary.delete({
    where: {
      id,
    },
  });
};
