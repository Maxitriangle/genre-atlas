# Registre des traitements — Every Genre (every-genre.com)

Document interne, tenu par le responsable de traitement (article 30 du RGPD). Il n'est pas publié. La page légale (`/legal/`, `includes/legal.php`) en est la version destinée aux visiteurs. **Toute nouvelle collecte de données, tout cookie ou service extérieur ajouté au site doit y figurer, ainsi que sur la page légale.**

Mis à jour le 03/11/2026 (v0.21.0, comptes).

## Responsable de traitement
- Le responsable est l'éditeur du site : un particulier, site personnel et non commercial. Son identité est confiée à l'hébergeur (LCEN, art. 6-III-2).
- Pour le contacter : le formulaire `/contact/`, avec une réponse dans le mois.
- Pas de délégué à la protection des données : il n'est pas obligatoire pour ce site.

## Sous-traitant
- **o2switch SAS** (Clermont-Ferrand, France) héberge le site, la base de données et la messagerie.
- Données hébergées en France. Aucun transfert hors de l'Union européenne de notre fait.

## Traitements

### 1. Comptes membres (v0.21.0)
- **Finalité** : garder l'atlas d'un membre (favoris, genres écoutés, historique s'il l'active) et le lui rendre sur tous ses appareils ; profil public s'il le choisit.
- **Base légale** : exécution du contrat (art. 6.1.b), via les conditions d'utilisation acceptées à l'inscription.
- **Personnes** : les membres, de 15 ans ou plus, déclaratif à l'inscription.
- **Données** :
  - pseudo et adresse e-mail ;
  - mot de passe haché par WordPress, ou identifiant Google ou Facebook ;
  - date d'acceptation des conditions ;
  - favoris (genres, titres) et genres écoutés, avec la date de première écoute ;
  - historique d'écoute (titre, artiste, genre, heure), **seulement s'il est activé**, et effacé quand il est désactivé ;
  - profil public (oui ou non), dernière visite (jour), adresse e-mail en attente de confirmation.
- **Durées de conservation** :
  - compte non confirmé : supprimé après 7 jours ;
  - compte inutilisé : supprimé après 3 ans, après un e-mail d'avertissement un mois avant ;
  - suppression par le membre : immédiate et totale.
  - Tâche quotidienne `genre_atlas_accounts_daily`.
- **Destinataires** : l'éditeur seul. Rien n'est vendu ni partagé, il n'y a ni publicité ni profilage.
- **Google et Facebook** (connexion « Continue with… ») — **prête mais pas activée** : Maxime a choisi le 03/11/2026 de rester sur l'inscription par e-mail. Sans clés dans Genres → Settings, aucun bouton ne s'affiche, et la page légale ne mentionne pas ces services. Si un jour les clés sont réglées :
  - ce sont des responsables de traitement indépendants pour leur propre service ;
  - ils ne sont contactés que si le visiteur choisit ce bouton (redirection, aucun script chargé) ;
  - nous recevons l'identifiant, le nom et l'e-mail, et nous gardons l'identifiant et l'e-mail, pas le nom ;
  - quand un utilisateur retire l'application de son compte Facebook, Meta appelle `/wp-json/genre-atlas/v1/oauth/facebook/delete` : le lien avec Facebook est retiré, et le compte est supprimé si Facebook était son seul moyen de connexion.
- **Droits** : en libre-service dans MY ATLAS (télécharger toutes ses données en JSON, changer d'e-mail ou de mot de passe, désactiver l'historique ou le profil public, supprimer le compte). Pour le reste, le formulaire de contact.

### 2. Formulaire de contact (v0.12.0)
- **Finalité** : répondre aux messages et corriger l'atlas.
- **Base légale** : intérêt légitime (répondre à une demande).
- **Données** : sujet, genre, nom facultatif, e-mail, message.
- **Durée** : supprimé quand il ne sert plus, ou sur demande. C'est à faire à la main dans Messages.
- **Destinataires** : l'éditeur (copie dans WordPress et envoi à l'adresse réglée).

### 3. Propositions de la communauté (v0.13.0)
- **Finalité** : afficher des artistes et des playlists proposés, après validation.
- **Base légale** : intérêt légitime, et accord de l'auteur à l'envoi.
- **Données** : lien, nom, note, pseudo facultatif. Pas d'e-mail.
- **Durée** : tant que la proposition est en ligne. Une proposition refusée part à la corbeille.

### 4. Mesure d'audience (Matomo, sur le site)
- **Finalité** : savoir quelles pages sont lues.
- **Base légale** : intérêt légitime, mesure exemptée de consentement selon la CNIL :
  - IP raccourcies (2 octets) ;
  - aucun cookie ;
  - conservation de 25 mois au plus ;
  - pas de croisement ;
  - droit d'opposition par un bouton sur `/legal/`.
- **Destinataires** : l'éditeur seul. Les données restent chez o2switch.

### 5. Lutte contre les abus
- **Finalité** : limiter les envois et les tentatives :
  - contact : 5 par heure ;
  - propositions : 10 par heure ;
  - inscription : 5 par heure ;
  - connexion : 30 par heure et par connexion ;
  - 8 mauvais mots de passe verrouillent un compte un quart d'heure.
- **Base légale** : intérêt légitime (sécurité).
- **Données** : une empreinte salée de l'adresse IP, jamais l'adresse elle-même, gardée **une heure** (transients WordPress). Le compteur d'échecs d'un compte est gardé 15 minutes.

## Cookies et stockage local
- **Aucun cookie à la simple visite.**
- **Cookies de connexion WordPress** (`wordpress_logged_in_…`, `wordpress_sec_…`) :
  - posés à la connexion, pour 14 jours ou jusqu'à la déconnexion ;
  - strictement nécessaires au compte, donc exemptés de consentement.
- **`mtm_consent_removed`** : posé seulement si le visiteur refuse d'être compté par Matomo.
- **Stockage local du navigateur** (pas un cookie) : réglages SOUND ON, FULL / 30 S, MY MAP, et la note YouTube lue. Rien ne quitte l'appareil.
- **Services tiers, seulement au clic** :
  - YouTube (titres entiers, lecteur youtube.com, cookies et publicités de YouTube) ;
  - Deezer (extraits de 30 s) ;
  - Google et Facebook (connexion).

## Sécurité
- HTTPS (certificat o2switch).
- Mots de passe hachés par WordPress, jamais stockés en clair.
- Liens de confirmation à usage unique, valables 2 jours. Liens de nouveau mot de passe valables 1 jour.
- Connexion Google avec PKCE, nonce et `state` à usage unique. Facebook avec `appsecret_proof` et `state` à usage unique. Signature vérifiée sur l'appel de suppression de Meta.
- Les membres n'ont aucun accès à l'administration. Les comptes administrateurs ne se connectent ni par Google ou Facebook, ni par `/my-atlas/`, pour le nouveau mot de passe comme pour la suppression.
- Clés Google et Facebook gardées dans les réglages de WordPress, jamais dans le dépôt.
- Sauvegardes : celles d'o2switch.

## Violation de données : procédure
1. **Contenir** : changer les mots de passe d'administration et les clés Google et Facebook (dans leurs consoles, puis dans Genres → Settings), mettre l'extension à jour ou la désactiver.
2. **Évaluer** : quelles données, combien de membres, quel risque.
3. **Notifier la CNIL dans les 72 heures** si la fuite présente un risque pour les personnes (notifications.cnil.fr).
4. **Prévenir les membres** sans tarder si le risque est élevé (e-mail), en leur disant quoi faire, par exemple changer de mot de passe.
5. **Consigner** l'incident ici, même s'il n'a pas été notifié : date, faits, effets, mesures prises.

### Incidents
Aucun à ce jour.

## Analyse d'impact (AIPD)
Elle n'est pas requise :
- pas de données sensibles ;
- pas de surveillance systématique ;
- pas de profilage ni de décision automatisée ;
- un public sans vulnérabilité particulière (15 ans et plus).

L'historique d'écoute est facultatif, désactivé par défaut et effaçable.
