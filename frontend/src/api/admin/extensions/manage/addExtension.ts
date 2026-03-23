import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { adminBackendExtensionSchema } from '@/lib/schemas/admin/backendExtension.ts';

export default async (extension: File): Promise<z.infer<typeof adminBackendExtensionSchema>> => {
  return new Promise((resolve, reject) => {
    axiosInstance
      .put('/api/admin/extensions/manage/add', extension, {
        headers: {
          'Content-Type': 'application/zip',
        },
      })
      .then(({ data }) => resolve(data.extension))
      .catch(reject);
  });
};
