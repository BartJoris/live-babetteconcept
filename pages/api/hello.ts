// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiResponse } from "next";
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

type Data = {
  name: string;
};

async function handler(
  _req: NextApiRequestWithSession,
  res: NextApiResponse<Data>,
) {
  res.status(200).json({ name: "John Doe" });
}

export default withAuth(handler);
