import { axiosInstance } from '@/api/axios.ts';

export default async (packageName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    axiosInstance
      .delete(`/api/admin/extensions/manage/${packageName}`)
      .then(() => resolve())
      .catch(reject);
  });
};
