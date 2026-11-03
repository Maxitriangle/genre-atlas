# Connexion avec Google et Facebook : créer les clés

À faire par Maxime, une fois la v0.21.0 installée. Les boutons « CONTINUE WITH GOOGLE » et « CONTINUE WITH FACEBOOK » n'apparaissent sur `/my-atlas/` que lorsque les deux clés du service sont collées dans **WordPress → Genres → Settings**, rubrique « Accounts ». Les clés ne se donnent jamais dans une conversation : elles se collent directement dans WordPress.

L'écran Settings affiche aussi les adresses à recopier ci-dessous, déjà calculées pour le site.

Les consoles de Google et de Meta changent souvent de présentation. Si un libellé ne correspond plus, chercher l'équivalent, ou faire une capture d'écran : Claude guidera.

## Google (gratuit)
1. Aller sur **console.cloud.google.com**, avec le compte Google qui sera propriétaire de l'accès.
2. En haut, **créer un projet** nommé `every-genre`.
3. Menu **Google Auth Platform** (anciennement « Écran de consentement OAuth ») :
   - **Branding** :
     - nom de l'application `Every Genre` ;
     - e-mail d'assistance ;
     - domaine autorisé `every-genre.com` ;
     - page d'accueil `https://every-genre.com/` ;
     - règles de confidentialité `https://every-genre.com/legal/` ;
     - conditions d'utilisation `https://every-genre.com/legal/#terms-of-use`.
   - **Audience** : « Externe », puis **Publier l'application** (mode production). Les accès demandés (e-mail, profil de base) ne nécessitent pas de validation par Google.
4. **Clients → Créer un client** :
   - type « Application Web », nom `every-genre` ;
   - **URI de redirection autorisés** : `https://every-genre.com/my-atlas/oauth/google/callback/`, à recopier exactement, barre finale comprise.
5. Google affiche l'**ID client** et le **code secret du client**. Les coller dans WordPress → Genres → Settings (« Google: client ID » et « Google: client secret »), puis **Save**.
6. Vérifier : se déconnecter de WordPress, ouvrir `/my-atlas/`, cliquer « CONTINUE WITH GOOGLE ».

## Facebook (gratuit)
1. Aller sur **developers.facebook.com**, se connecter, et devenir développeur si c'est demandé.
2. **Mes applications → Créer une application** :
   - cas d'usage « Authentifier les utilisateurs avec Facebook Login » ;
   - nom `Every Genre` ;
   - pas besoin de portefeuille business.
3. **Facebook Login → Paramètres** :
   - **URI de redirection OAuth valides** : `https://every-genre.com/my-atlas/oauth/facebook/callback/` ;
   - « Utiliser le mode HTTPS strict » : oui.
4. **Paramètres de l'application → Général** :
   - domaine `every-genre.com` ;
   - URL de la politique de confidentialité `https://every-genre.com/legal/` ;
   - URL des conditions `https://every-genre.com/legal/#terms-of-use` ;
   - **Suppression des données utilisateur** : choisir « URL de rappel de suppression des données » et saisir `https://every-genre.com/wp-json/genre-atlas/v1/oauth/facebook/delete` ;
   - catégorie « Divertissement », et une icône de 1024 × 1024 (le glyphe du site, `genre-atlas/assets/icons/`).
5. **Autorisations** : `email` et `public_profile` (accès standard, sans examen par Meta).
6. Passer l'application en mode **Live** (« En ligne »).
7. Copier l'**ID de l'application** et la **clé secrète** (Paramètres → Général). Les coller dans WordPress → Genres → Settings (« Facebook: app ID » et « Facebook: app secret »), puis **Save**. Laisser vide la version de l'API Graph : le site utilise la v23.0. Ne la changer que si Meta annonce sa fin.
8. Vérifier comme pour Google.

## Les e-mails du site
L'inscription et le mot de passe oublié envoient des e-mails depuis le site. Pour qu'ils n'arrivent pas en spam :
- l'adresse réglée dans Genres → Settings → Contact form doit être sur le domaine (`contact@every-genre.com`). Elle sert alors d'expéditeur ;
- dans le cPanel d'o2switch, rubrique **E-mail Deliverability**, les enregistrements **SPF** et **DKIM** du domaine doivent être « Valid ». Sinon, cliquer « Repair » ;
- faire un essai : créer un compte avec une adresse Gmail, et regarder si le message arrive en boîte de réception.
