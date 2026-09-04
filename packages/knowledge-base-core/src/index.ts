/**
 * @gigalibs/knowledge-base-core
 *
 * Categorized Help Center articles, search indexing, and feedback ratings.
 *
 * @module
 */

import { generateId } from '@gigalibs/crypto';

export interface KbArticle {
  id: string;
  tenantId: string;
  category: string;
  title: string;
  slug: string;
  content: string; // Markdown or HTML
  tags: string[];
  isPublished: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class KnowledgeBaseService {
  private articles: KbArticle[] = [];

  createArticle(input: Omit<KbArticle, 'id' | 'slug' | 'helpfulCount' | 'unhelpfulCount' | 'createdAt' | 'updatedAt'>): KbArticle {
    const slug = input.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    const article: KbArticle = {
      ...input,
      id: generateId(),
      slug,
      helpfulCount: 0,
      unhelpfulCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.articles.push(article);
    return article;
  }

  searchArticles(query: string): KbArticle[] {
    const term = query.toLowerCase().trim();
    return this.articles.filter(
      (a) => a.isPublished && (a.title.toLowerCase().includes(term) || a.content.toLowerCase().includes(term)),
    );
  }
}
