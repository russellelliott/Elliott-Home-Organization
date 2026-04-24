import { getAllBooksForList } from '../../lib/books';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const books = await getAllBooksForList();
    return res.status(200).json({ books });
  } catch (error) {
    console.error('Books list API error:', error);
    return res.status(500).json({ message: 'Failed to load books' });
  }
}