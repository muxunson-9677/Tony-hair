import type { HairstyleFavoriteTarget } from '../hairstyle-library/types'

interface HomeFavoriteCatalogItem {
  readonly id: string
  readonly status: 'active' | 'retired'
}

export const resolveHomeFavorite = <Style extends HomeFavoriteCatalogItem>(
  favorites: readonly HairstyleFavoriteTarget[],
  catalog: readonly Style[],
): Style | null => {
  const stylesById = new Map(catalog.map((style) => [style.id, style]))

  for (const favorite of favorites) {
    if (favorite.itemType !== 'curated_style') {
      continue
    }
    const style = stylesById.get(favorite.itemId)
    if (style?.status === 'active') {
      return style
    }
  }

  return null
}
