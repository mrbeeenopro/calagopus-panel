import { axiosInstance } from '@/api/axios.ts';

export default async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    axiosInstance
      .post('/api/admin/extensions/manage/rebuild')
      .then(() => resolve())
      .catch(reject);
  });
};
