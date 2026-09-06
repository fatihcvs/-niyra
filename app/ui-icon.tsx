import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { ChatCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { Desktop } from "@phosphor-icons/react/dist/csr/Desktop";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Files } from "@phosphor-icons/react/dist/csr/Files";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Moon } from "@phosphor-icons/react/dist/csr/Moon";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { Sun } from "@phosphor-icons/react/dist/csr/Sun";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { VideoCamera } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { Storefront } from "@phosphor-icons/react/dist/csr/Storefront";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";

const icons = {
  home:House, compass:Compass, notes:Files, users:UsersThree, bell:Bell, bookmark:BookmarkSimple,
  search:MagnifyingGlass, plus:Plus, image:ImageSquare, video:VideoCamera, file:FileText, sparkles:Sparkle,
  more:DotsThree, heart:Heart, comment:ChatCircle, share:PaperPlaneTilt, check:Check,
  calendar:CalendarBlank, arrow:ArrowRight, close:X, send:PaperPlaneTilt, message:ChatCircleDots,
  edit:PencilSimple, trash:Trash, flag:Flag, settings:GearSix, sun:Sun, moon:Moon, monitor:Desktop,
  back:ArrowLeft, refresh:ArrowClockwise, book:BookOpen, map:MapPin, lightning:Lightning,
  store:Storefront, shield:ShieldCheck, warning:WarningCircle,
};
export type UiIconName = keyof typeof icons;

/** Decorative by contract: a button/link or adjacent text owns the accessible label. */
export function UiIcon({ name, size = 20, weight = "regular", selected = false }: { name:UiIconName; size?:number; weight?:"regular" | "fill" | "bold" | "duotone"; selected?:boolean }) {
  const Component = icons[name];
  return <Component size={size} weight={selected ? "fill" : weight} aria-hidden="true" focusable="false"/>;
}
