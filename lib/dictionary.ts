// Server only: the full lexicon must never enter the browser bundle.
import words from "../data/words.json";
import metadata from "../data/dictionary.json";
export const DICTIONARY = metadata;
export function isWord(word: string, version=metadata.version): boolean {
  if(version!==metadata.version) throw new Error("Unsupported dictionary version");
  const bucket=(words as Record<string,string>)[word.slice(0,2)];
  return bucket?.includes(`\n${word}\n`) || false;
}
