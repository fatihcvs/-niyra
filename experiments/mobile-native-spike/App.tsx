import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { randomUUID } from "expo-crypto";
import { ApiError, createApi, type Conversation, type Person, type Post, type Profile } from "./src/api";
import { createSessionState, type Route } from "./src/session-state";
import kampiraMark from "./assets/kampira-mark.png";

type Api = ReturnType<typeof createApi>;
const publishingEnabled = process.env.EXPO_PUBLIC_ENABLE_PUBLISH === "1";
const mediaProbeEnabled = process.env.EXPO_PUBLIC_ENABLE_MEDIA_PROBE === "1";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Bağlantı kurulamadı. Yeniden deneyebilirsin.";

function Action({ label, onPress, disabled, quiet = false }: { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.action,quiet && styles.quiet,disabled && styles.disabled,pressed && styles.pressed]}><Text style={[styles.actionLabel,quiet && styles.quietLabel]}>{label}</Text></Pressable>;
}
function Notice({ message, retry }: { message: string; retry?: () => void }) {
  return <View style={styles.notice}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>{retry && <Action label="Yeniden dene" onPress={retry} quiet/>}</View>;
}
function PrivateImageProbe({ api, media }: { api: Api; media: Post["media"][number] }) {
  const [failed,setFailed] = useState(false);
  const url = api.mediaUrl(media.url);
  if (!mediaProbeEnabled || media.kind !== "image" || !url || failed) return <View style={styles.mediaNotice}><Text style={styles.meta}>{media.kind === "video" ? "Video" : "Görsel"} mevcut. {failed ? "Native medya erişimi doğrulanamadı." : "Özel medya cihaz doğrulaması bekliyor."}</Text></View>;
  return <Image alt="Gönderiye eklenen görsel" accessibilityLabel="Gönderiye eklenen görsel" source={{ uri: url, cache: "reload" }} onError={() => setFailed(true)} onLoad={({ nativeEvent }) => { if (nativeEvent.source.width <= 1 && nativeEvent.source.height <= 1) setFailed(true); }} style={[styles.media,{ aspectRatio: media.width && media.height ? media.width/media.height : 1 }]} resizeMode="contain"/>;
}
function PostCard({ post, api, onPerson }: { post: Post; api: Api; onPerson: (id:string) => void }) {
  return <View style={styles.post}>
    {post.authorId ? <Pressable accessibilityRole="button" accessibilityLabel={`${post.name} profilini aç`} onPress={() => onPerson(post.authorId!)} style={styles.author}><Text style={styles.strong}>{post.name}</Text><Text style={styles.meta}>{post.course} · {post.time}</Text></Pressable> : <Text style={styles.strong}>{post.name}</Text>}
    <Text style={styles.body} selectable>{post.text}</Text>
    {post.media.map((media) => <PrivateImageProbe api={api} media={media} key={media.id}/>)}
    <Text style={styles.meta}>{post.likes} beğeni · {post.comments} yorum</Text>
  </View>;
}

function NativeScout({ api }: { api: Api }) {
  const [store] = useState(createSessionState);
  const [,redraw] = useReducer((count:number) => count+1,0);
  const route = store.route;
  const [viewer,setViewer] = useState<Profile|null>(null);
  const [verified,setVerified] = useState(false);
  const [active,setActive] = useState(AppState.currentState === "active");
  const [checking,setChecking] = useState(false);
  const checkingRef = useRef(false);
  const connectionId = useRef(0);
  const allowResume = useRef(true);
  const [error,setError] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [feedLoading,setFeedLoading] = useState(false);
  const loadingRef = useRef(false);
  const [person,setPerson] = useState<Person|null>(null);
  const [conversations,setConversations] = useState<Conversation[]>([]);
  const [publishing,setPublishing] = useState(false);
  const publishRef = useRef(false);
  const listRef = useRef<FlatList<Post>>(null);
  const mounted = useRef(true);

  const expire = useCallback((message: string) => {
    store.setOwner(null); loadingRef.current = false; setLoading(false); setFeedLoading(false); setViewer(null); setVerified(false); setPerson(null); setConversations([]); setPassword(""); setError(message); redraw();
  },[store]);
  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) expire("Oturum doğrulanamadı. Yeniden giriş yapmalısın.");
    else setError(errorText(cause));
  },[expire]);

  const connect = useCallback(async (credentials?: { email:string; password:string }) => {
    if (checkingRef.current) return;
    const attempt = ++connectionId.current;
    allowResume.current = true; checkingRef.current = true; setChecking(true); setVerified(false); setError("");
    if (credentials) { store.setOwner(null); setViewer(null); setPerson(null); setConversations([]); redraw(); }
    const request = store.begin("session");
    try {
      const session = credentials ? await api.login(credentials.email,credentials.password,request.signal) : await api.session(request.signal);
      if (!request.current() || !mounted.current) return;
      const changed = store.owner !== session.profile.publicId;
      store.setOwner(session.profile); setViewer(session.profile); setVerified(true);
      if (changed) { setPerson(null); setConversations([]); }
      redraw();
    } catch (cause) { if (request.current() && mounted.current) { if (cause instanceof ApiError && (cause.status === 401 || cause.status === 409)) expire(errorText(cause)); else setError(errorText(cause)); } }
    finally { request.finish(); if (attempt === connectionId.current) { checkingRef.current = false; if (mounted.current) setChecking(false); } }
  },[api,store,expire]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change",(state) => {
      const foreground = state === "active"; setActive(foreground);
      if (!foreground) { store.pause(); setVerified(false); setPassword(""); setLoading(false); setFeedLoading(false); loadingRef.current = false; connectionId.current++; checkingRef.current = false; setChecking(false); }
      else if (allowResume.current) void connect();
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mount starts an external cookie-session probe; its result is generation guarded.
    if (AppState.currentState === "active") void connect();
    return () => { mounted.current = false; subscription.remove(); store.pause(); };
  },[connect,store]);

  const navigate = useCallback((destination: Route) => { store.navigate(destination); setError(""); redraw(); },[store]);
  const back = useCallback(() => { const handled = store.back(); if (handled) { setError(""); redraw(); } return handled; },[store]);
  useEffect(() => { const subscription = BackHandler.addEventListener("hardwareBackPress",back); return () => subscription.remove(); },[back]);

  const loadFeed = useCallback(async (append = false) => {
    if (!store.owner || loadingRef.current || (append && !store.canLoadMore)) return;
    loadingRef.current = true; setFeedLoading(true); setError("");
    const request = store.begin("feed");
    try { const page = await api.feed(append ? store.feed.nextCursor : null,request.signal); if (request.current() && mounted.current) { store.setFeed(page,append); redraw(); } }
    catch (cause) { if (request.current() && mounted.current) handleError(cause); }
    finally { if (request.current()) { loadingRef.current = false; if (mounted.current) setFeedLoading(false); } request.finish(); }
  },[api,handleError,store]);

  const [reload,setReload] = useState(0);
  const personId = route.name === "profile" ? route.id : null;
  useEffect(() => {
    if (!verified || !active) return;
    if (route.name === "feed") { if (!store.feedLoaded) void loadFeed(); return; }
    if (route.name === "composer") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- This effect owns the external profile/DM read and its loading lifecycle.
    const request = store.begin("screen"); setLoading(true); setError("");
    if (personId) setPerson(null);
    void (async () => {
      try { if (personId) { const result = await api.person(personId,request.signal); if (request.current()) setPerson(result); } else { const result = await api.conversations(request.signal); if (request.current()) setConversations(result); } }
      catch (cause) { if (request.current()) handleError(cause); }
      finally { if (request.current()) setLoading(false); request.finish(); }
    })();
    return request.cancel;
  },[api,active,handleError,loadFeed,personId,route.name,reload,store,verified]);

  async function logout() {
    if (checkingRef.current) return;
    allowResume.current = false; expire(""); checkingRef.current = true; setChecking(true);
    const attempt = ++connectionId.current;
    try { await api.logout(); }
    catch { if (mounted.current && attempt === connectionId.current) setError("Bu cihazdaki içerikler temizlendi; sunucu oturumunun kapatıldığı doğrulanamadı. Web üzerinden oturumunu sonlandır."); }
    finally { if (attempt === connectionId.current) { checkingRef.current = false; if (mounted.current) setChecking(false); } }
  }
  async function publish() {
    if (!publishingEnabled || !verified || !store.owner || publishRef.current || !store.draft.text.trim()) return;
    publishRef.current = true; setPublishing(true); setError("");
    const draft = store.draft; const key = store.publicationKey(randomUUID); const request = store.begin("publish");
    try { const post = await api.publish(draft.text,draft.audience,key,request.signal); if (request.current()) { store.confirmPublish(key,post); store.back(); redraw(); } }
    catch (cause) { if (request.current()) handleError(cause); }
    finally { request.finish(); publishRef.current = false; if (mounted.current) setPublishing(false); }
  }
  const openWeb = (path = "/") => void Linking.openURL(`${api.origin}${path}`).catch(() => setError("Web bağlantısı açılamadı."));

  if (!active) return <SafeAreaView style={styles.screen}><View style={styles.center}><Text style={styles.title}>Kampira</Text><Text style={styles.meta}>Uygulamaya dönünce oturum yeniden denetlenir.</Text></View></SafeAreaView>;
  if (!verified || !viewer) return <SafeAreaView style={styles.screen}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.login}>
    <Image alt="Kampira" source={kampiraMark} style={styles.mark} accessibilityLabel="Kampira"/>
    <Text style={styles.title}>Kampira native denemesi</Text><Text style={styles.body}>Bağlanmadı. Yalnız doğrulanmış Kampira oturumundan gelen içerik gösterilir.</Text>
    <Text style={styles.meta}>{api.origin}</Text>{checking && <ActivityIndicator accessibilityLabel="Oturum doğrulanıyor" color="#6548e8"/>}{error && <Notice message={error}/>}
    <Text style={styles.label}>E-posta</Text><TextInput accessibilityLabel="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!checking} style={styles.input}/>
    <Text style={styles.label}>Parola</Text><TextInput accessibilityLabel="Parola" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!checking} style={styles.input}/>
    <Action label={checking ? "Doğrulanıyor…" : "Kampira hesabıyla giriş yap"} disabled={checking || !email.trim() || !password} onPress={() => { const credentials = {email,password}; setPassword(""); void connect(credentials); }}/>
    <Action label="Mevcut native oturumu denetle" disabled={checking} onPress={() => void connect()} quiet/>
    <Action label="Kampira web uygulamasını aç" onPress={() => openWeb()} quiet/>
    <Text style={styles.meta}>Tarayıcıdaki giriş buraya otomatik taşınmaz. Çerez aktarımı başarısız olursa içerikler kapalı kalır. Yeni hesap oluşturma ve akademik profil işlemleri web uygulamasındadır.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;

  return <SafeAreaView style={styles.screen} edges={["top","bottom","left","right"]}>
    <StatusBar style="dark"/>
    <View style={styles.header}>{route.name === "profile" || route.name === "composer" ? <Action label="Geri" onPress={back} quiet/> : <Image alt="Kampira" source={kampiraMark} style={styles.smallMark} accessibilityLabel="Kampira"/>}<Text style={styles.heading}>{route.name === "feed" ? "Akış" : route.name === "profile" ? "Öğrenci profili" : route.name === "messages" ? "Mesajlar" : "Yeni gönderi"}</Text>{route.name === "feed" && <Action label="Çıkış" onPress={() => void logout()} quiet/>}</View>
    <Text style={styles.experiment}>Native deneme · {viewer.displayName}</Text>
    {error && <Notice message={error} retry={route.name === "feed" ? () => void loadFeed() : route.name === "composer" ? undefined : () => setReload((count) => count+1)}/>}
    {route.name === "feed" && <FlatList ref={listRef} data={store.feed.posts} keyExtractor={(post) => post.id} renderItem={({item}) => <PostCard post={item} api={api} onPerson={(id) => navigate({name:"profile",id})}/>} onScroll={(event) => store.setFeedOffset(event.nativeEvent.contentOffset.y)} scrollEventThrottle={100} onContentSizeChange={() => { if (store.feedOffset > 0) listRef.current?.scrollToOffset({offset:store.feedOffset,animated:false}); }} refreshing={feedLoading} onRefresh={() => void loadFeed()} ListEmptyComponent={<Notice message={feedLoading ? "Gönderiler yükleniyor…" : error ? "Akış henüz alınamadı." : "Henüz gönderi yok."}/>} ListFooterComponent={store.canLoadMore ? <Action label={feedLoading ? "Yükleniyor…" : "Daha fazla gönderi"} onPress={() => void loadFeed(true)} disabled={feedLoading} quiet/> : store.feed.posts.length >= 200 ? <Text style={styles.meta}>Bu denemenin yaklaşık 200 gönderilik okuma sınırına ulaşıldı.</Text> : null} contentContainerStyle={styles.list}/>}
    {route.name === "profile" && <ScrollView contentContainerStyle={styles.list}>{loading || (person !== null && person.publicId !== personId) ? <ActivityIndicator accessibilityLabel="Profil yükleniyor" color="#6548e8"/> : person ? <><View style={styles.profile}><Text style={styles.title}>{person.displayName}</Text><Text style={styles.meta}>@{person.handle}</Text><Text style={styles.body}>{person.universityName} · {person.departmentName}</Text>{person.bio ? <Text style={styles.body}>{person.bio}</Text> : null}<Text style={styles.meta}>{person.postCount} gönderi · {person.followerCount} takipçi · {person.followingCount} takip</Text><Action label="Web profilini aç" onPress={() => openWeb(`/?profile=${encodeURIComponent(person.publicId)}`)} quiet/></View>{person.posts.map((post) => <PostCard key={post.id} post={post} api={api} onPerson={(id) => { if (id !== person.publicId) navigate({name:"profile",id}); }}/>)}</> : !error && <Notice message="Profil yüklenemedi."/>}</ScrollView>}
    {route.name === "messages" && <FlatList data={conversations} keyExtractor={(item) => item.id} refreshing={loading} onRefresh={() => setReload((count) => count+1)} renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.person.displayName} profilini aç, ${item.unreadCount} okunmamış mesaj`} onPress={() => navigate({name:"profile",id:item.person.publicId})} style={styles.conversation}><View style={styles.row}><Text style={styles.strong}>{item.person.displayName}</Text><Text style={styles.meta}>{item.time}</Text></View><Text style={styles.body} numberOfLines={2}>{item.preview}</Text>{item.unreadCount > 0 && <Text style={styles.unread}>{item.unreadCount} okunmamış</Text>}</Pressable>} ListHeaderComponent={<Notice message="Gerçek konuşma özeti. Bu sınırlı denemede bir satır alıcının profilini açar; sohbet yazma ekranı web uygulamasındadır."/>} ListEmptyComponent={<Notice message={loading ? "Konuşmalar yükleniyor…" : error ? "Konuşmalar alınamadı." : "Henüz konuşma yok."}/>} contentContainerStyle={styles.list}/>}
    {route.name === "composer" && <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.composer}><Text style={styles.strong}>{viewer.displayName}</Text><View style={styles.row}><Action label="Genel akış" quiet={store.draft.audience !== "platform"} disabled={publishing} onPress={() => {store.editDraft(store.draft.text,"platform");redraw();}}/><Action label="Kampüs" quiet={store.draft.audience !== "campus"} disabled={publishing} onPress={() => {store.editDraft(store.draft.text,"campus");redraw();}}/></View><TextInput accessibilityLabel="Gönderi metni" value={store.draft.text} onChangeText={(value) => {store.editDraft(value);redraw();}} editable={!publishing} multiline maxLength={1200} placeholder="Ne paylaşmak istersin?" textAlignVertical="top" style={[styles.input,styles.editor]}/><Text style={styles.meta}>{store.draft.text.length}/1200 · Taslak bu oturumun belleğinde korunur.</Text>{publishingEnabled ? <Action label={publishing ? "Paylaşılıyor…" : "Paylaş"} disabled={publishing || !store.draft.text.trim()} onPress={() => void publish()}/> : <Notice message="Bu denemede yayınlama kapalı. Taslak ve geri dönüş akışı kullanılabilir; gerçek yayın için web uygulamasını aç."/>}<Action label="Taslağı koruyup geri dön" onPress={back} quiet/></ScrollView></KeyboardAvoidingView>}
    {route.name !== "composer" && route.name !== "profile" && <View style={styles.navigation} accessibilityRole="tablist">{([{name:"feed",label:"Akış"},{name:"composer",label:"Paylaş"},{name:"messages",label:"Mesajlar"}] as const).map((item) => <Pressable key={item.name} accessibilityRole={item.name === "composer" ? "button" : "tab"} accessibilityState={{selected:route.name===item.name}} onPress={() => navigate({name:item.name})} style={styles.navItem}><Text style={[styles.navLabel,route.name===item.name && styles.selected]}>{item.label}</Text></Pressable>)}</View>}
  </SafeAreaView>;
}

export default function App() {
  const [config] = useState(() => { try { return {api:createApi({origin:process.env.EXPO_PUBLIC_API_ORIGIN})}; } catch (error) { return {error:errorText(error)}; } });
  return <SafeAreaProvider>{config.api ? <NativeScout api={config.api}/> : <SafeAreaView style={styles.screen}><Notice message={config.error ?? "API adresi doğrulanamadı."}/></SafeAreaView>}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#ffffff"},flex:{flex:1},center:{flex:1,justifyContent:"center",alignItems:"center",padding:24,gap:16},login:{padding:24,gap:14,flexGrow:1},mark:{width:72,height:72,resizeMode:"contain",marginBottom:8},smallMark:{width:32,height:32,resizeMode:"contain"},title:{fontSize:26,lineHeight:32,fontWeight:"700",color:"#172033"},heading:{fontSize:20,fontWeight:"700",color:"#172033",flex:1},header:{paddingHorizontal:16,minHeight:60,gap:12,flexDirection:"row",alignItems:"center",borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#e4e7ed"},body:{fontSize:16,lineHeight:24,color:"#313a4d"},meta:{fontSize:13,lineHeight:19,color:"#6c7385"},strong:{fontSize:16,lineHeight:22,fontWeight:"600",color:"#172033"},label:{fontSize:14,fontWeight:"600",color:"#172033"},input:{minHeight:48,borderWidth:1,borderColor:"#d8dce4",borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:16,color:"#172033",backgroundColor:"#fafbfc"},action:{minHeight:48,borderRadius:12,paddingHorizontal:16,paddingVertical:12,backgroundColor:"#6548e8",justifyContent:"center",alignItems:"center"},actionLabel:{fontSize:15,fontWeight:"600",color:"#fff"},quiet:{backgroundColor:"#f3f4f7"},quietLabel:{color:"#273248"},disabled:{opacity:0.5},pressed:{opacity:0.7},notice:{padding:16,gap:12,backgroundColor:"#f5f6f8"},experiment:{fontSize:12,lineHeight:18,color:"#6c7385",paddingHorizontal:16,paddingVertical:8},list:{paddingBottom:16},post:{padding:16,gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#e4e7ed"},author:{minHeight:48,justifyContent:"center",gap:4},media:{width:"100%",maxHeight:500,backgroundColor:"#f5f6f8"},mediaNotice:{padding:16,backgroundColor:"#f5f6f8",borderRadius:12},profile:{padding:20,gap:12},conversation:{minHeight:88,padding:16,gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:"#e4e7ed"},row:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:8},unread:{color:"#6548e8",fontSize:13,fontWeight:"600"},composer:{padding:20,gap:16},editor:{minHeight:200},navigation:{flexDirection:"row",borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:"#e4e7ed"},navItem:{flex:1,minHeight:56,alignItems:"center",justifyContent:"center"},navLabel:{fontSize:14,fontWeight:"500",color:"#6c7385"},selected:{color:"#6548e8",fontWeight:"700"},
});
