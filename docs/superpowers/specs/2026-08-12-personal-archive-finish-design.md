# Personal Archive Finish Design

## Outcome

Make the archive immediately feel specific to the person using it. Reuse the data already stored on the device instead of introducing new accounts, cloud services, AI claims, or database tables.

## Options considered

1. **Cosmetic restyle only.** Cheapest, but does not explain why the archive belongs to this user.
2. **Personal photo wall and decision summary (selected).** Promote the existing front/side/back photos, presentation preference, haircut before/after photos, result and salon location into a clear personal story.
3. **Automatic face/hair analysis.** Deferred because it would create an AI claim and a new accuracy/privacy burden.

## Experience

- The archive overview leads with the person's own photos and a compact summary derived only from stored facts.
- The summary names the preferred presentation, known hair facts, photo completeness and the next useful action. Unknown data stays unknown.
- Recent haircut history remains image-first. Before/after images are the primary evidence; legacy stages remain readable but are not requested from new records.
- Recording a haircut keeps the required path short: photo, date, satisfaction and result. Shop name/location are easy to discover in their own optional disclosure; service, price, duration, plan and notes stay one level deeper.
- Key links, disclosures, photo actions and result choices use the existing tactile system: instant pointer-down response, drag-away cancellation, release settle and reduced-motion fallback.

## Data and privacy

- No schema migration. Use `HairProfile.profilePhotos`, `genderIdentity`, `presentationPreference`, `HaircutRecord.salonName`, `salonLocation` and existing photos.
- No geolocation permission and no map API. Location remains user-entered local text.
- No image upload, AI analysis or inferred gender/style claim.

## Acceptance

- With one profile photo, the overview visibly identifies the owner and explains which angles are still missing.
- With three photos, the overview renders a labelled personal photo wall without cropping hair out.
- Presentation preference is visible as a personal decision hint; gender remains optional and is not used as a hard recommendation filter.
- New records expose only before/after photo inputs. Shop and location are discoverable without exposing the full advanced form.
- 360, 390 and 430px viewports have no horizontal overflow or bottom-navigation overlap.
- All new interactive targets are at least 44px and provide tactile/reduced-motion feedback.
