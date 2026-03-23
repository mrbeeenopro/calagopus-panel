import { axiosInstance } from '@/api/axios.ts';

export default async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    axiosInstance
      .get('/api/admin/extensions/manage/logs', {
        responseType: 'text',
      })
      .then(({ data }) => resolve(data))
      .catch(reject);
  });
};
